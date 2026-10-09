import { createHmac } from "node:crypto";
import type { AgentId, ApiKeyId, Manifestation, WebhookEvent } from "@/core";
import type { Deps } from "./deps";
import { enqueue } from "./queue";

/**
 * Tell outside agents what happened to the agent they act as. Each delivery is a job,
 * so it is retried with backoff until the receiver answers 2xx. Never throws: a
 * webhook problem must not break the session it is about.
 */
export async function emit(
  d: Deps,
  agentId: AgentId,
  event: WebhookEvent,
  subjectId: string,
  data: Record<string, unknown>,
  onlyKeyId?: string,
): Promise<void> {
  try {
    const keys = (await d.repos.apiKeys.byAgent(agentId)).filter(
      (k) => !k.revokedAt && k.webhookUrl && (!onlyKeyId || k.id === onlyKeyId),
    );
    for (const k of keys) {
      const deliveryId = d.newId();
      await enqueue(
        d,
        "webhook",
        {
          keyId: k.id,
          body: JSON.stringify({
            id: deliveryId,
            event,
            created_at: d.now(),
            agent_id: agentId,
            data,
          }),
        },
        { key: `webhook:${k.id}:${event}:${subjectId}`, maxAttempts: 8 },
      );
    }
  } catch (e) {
    console.error("webhook emit failed", event, e);
  }
}

/** A session changed status. */
export async function emitSession(d: Deps, m: Manifestation): Promise<void> {
  const event = `session.${m.status}` as WebhookEvent;
  if (m.status === "requested") return;
  const mission = await d.repos.missions.get(m.missionId).catch(() => null);
  if (!mission) return;
  await emit(d, mission.agentId, event, m.id, {
    session: { id: m.id, status: m.status, event_id: mission.eventId },
  });
}

/** POST one delivery, signed. Throws on anything but 2xx so the job retries. */
export async function deliver(d: Deps, keyId: string, body: string) {
  const key = await d.repos.apiKeys.get(keyId as ApiKeyId);
  // Revoked or webhook removed since: nothing to deliver to, and nothing to retry.
  if (!key || key.revokedAt || !key.webhookUrl || !key.webhookSecret) return;
  const t = Math.floor(Date.parse(d.now()) / 1000);
  const parsed = JSON.parse(body) as { id: string; event: string };
  const res = await fetch(key.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Omnipra-Webhooks/1",
      "omnipra-event": parsed.event,
      "omnipra-delivery": parsed.id,
      "omnipra-signature": `t=${t},v1=${sign(key.webhookSecret, t, body)}`,
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status < 200 || res.status >= 300)
    throw new Error(`webhook answered ${res.status}`);
}

/** HMAC SHA-256 over "<timestamp>.<body>", hex. Receivers recompute and compare. */
export function sign(secret: string, t: number, body: string): string {
  return createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
}
