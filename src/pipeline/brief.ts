import type { ManifestationId, StoredBriefing } from "@/core";
import { loadContext, type Deps } from "./deps";
import { applyTransition } from "./lifecycle";
import { observe } from "./observe";

/**
 * After a manifestation ends: process the transcript tail, write the briefing,
 * mark it briefed. Re-running on an already briefed manifestation returns the stored briefing.
 */
export async function brief(d: Deps, id: ManifestationId): Promise<StoredBriefing> {
  const existing = await d.repos.briefings.get(id);
  if (existing) return existing;

  await observe(d, id, { force: true });
  const ctx = await loadContext(d, id);
  const observations = await d.repos.observations.byManifestation(id);
  const briefing = await d.agent.brief({ ...ctx, observations });

  const stored: StoredBriefing = { ...briefing, manifestationId: id, createdAt: d.now() };
  await d.repos.briefings.save(stored);
  if (ctx.manifestation.status === "ended") await applyTransition(d, id, "brief");
  return stored;
}
