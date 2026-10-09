import { DomainError } from "@/core";
import { emit } from "@/pipeline";
import { drainSoon } from "@/server/jobs";
import { withCaller } from "@/server/api";

export const runtime = "nodejs";

/** POST: send a "ping" event to this key's webhook, to check the receiver end to end. */
export function POST(req: Request) {
  return withCaller(req, async (d, { key, agent }) => {
    if (!key.webhookUrl)
      throw new DomainError(
        "bad_request",
        "Set a webhook first: PUT /api/v1/webhook.",
      );
    await emit(d, agent.id, "ping", d.newId(), { hello: agent.name }, key.id);
    drainSoon(d, 0);
    return { sent: true };
  });
}
