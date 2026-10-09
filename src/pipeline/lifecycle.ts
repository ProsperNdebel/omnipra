import {
  DomainError,
  transition,
  type Manifestation,
  type ManifestationEvent,
  type ManifestationId,
  type TransitionInput,
} from "@/core";
import type { Deps } from "./deps";
import { enqueue } from "./queue";
import { emitSession } from "./webhooks";

/** The only way a manifestation changes status. Rejects stale writes instead of overwriting them. */
export async function applyTransition(
  d: Deps,
  id: ManifestationId,
  event: ManifestationEvent,
  input: TransitionInput = {},
): Promise<Manifestation> {
  const current = await d.repos.manifestations.get(id);
  if (!current) {
    throw new DomainError("not_found", `manifestation ${id} not found`);
  }
  const next = transition(current, event, d.now(), input);
  const ok = await d.repos.manifestations.save(next, current.status);
  if (!ok) {
    throw new DomainError(
      "conflict",
      `manifestation ${id} changed while applying ${event}`,
    );
  }
  await emitSession(d, next);
  // Once the outcome is known, charge or release the held payment (a job, so it retries).
  if (
    d.payments &&
    (next.status === "declined" ||
      next.status === "cancelled" ||
      next.status === "ended")
  )
    await enqueue(d, "settle", { id: next.id });
  return next;
}
