import type { AuditAction, AuditEntry, SessionContext, UserId } from "@/core";
import type { Deps } from "./deps";

/**
 * Write down who did what. Never fails the thing being recorded: a lost audit line is
 * bad, a session that can't end because of one is worse.
 */
export async function record(
  d: Deps,
  e: Omit<AuditEntry, "id" | "at" | "detail"> & { detail?: string | null },
): Promise<void> {
  await d.repos.audit
    .record({
      ...e,
      involved: [...new Set(e.involved)],
      detail: e.detail ?? null,
      id: d.newId(),
      at: d.now(),
    })
    .catch((err) => console.error("audit failed", e.action, err));
}

/** Something that happened to a session, visible to its owner and its host. */
export function recordSession(
  d: Deps,
  ctx: Pick<SessionContext, "manifestation" | "agent" | "endpoint">,
  actorId: UserId | null,
  action: AuditAction,
  detail?: string,
): Promise<void> {
  return record(d, {
    actorId,
    action,
    subject: { kind: "session", id: ctx.manifestation.id },
    involved: [ctx.agent.ownerId, ctx.endpoint.hostId],
    detail,
  });
}
