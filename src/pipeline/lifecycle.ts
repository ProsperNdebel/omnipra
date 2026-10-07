import { DomainError, transition, type Manifestation, type ManifestationEvent, type ManifestationId } from "@/core";
import type { Deps } from "./deps";

/** The only way a manifestation changes status. Rejects stale writes instead of overwriting them. */
export async function applyTransition(d: Deps, id: ManifestationId, event: ManifestationEvent): Promise<Manifestation> {
  const current = await d.repos.manifestations.get(id);
  if (!current) throw new DomainError("not_found", `manifestation ${id} not found`);
  const next = transition(current, event, d.now());
  const ok = await d.repos.manifestations.save(next, current.status);
  if (!ok) throw new DomainError("conflict", `manifestation ${id} changed while applying ${event}`);
  return next;
}
