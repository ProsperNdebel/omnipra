import {
  DomainError,
  transition,
  type Manifestation,
  type ManifestationEvent,
  type ManifestationId,
  type TransitionInput,
} from "@/core";
import type { Deps } from "./deps";
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
  return next;
}
