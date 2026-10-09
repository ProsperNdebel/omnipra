import type { ManifestationId, StoredBriefing } from "@/core";
import { loadContext, type Deps } from "./deps";
import { applyTransition } from "./lifecycle";
import { proposeHeard, recallMemory } from "./memory";
import { reflect } from "./reflect";
import { observe } from "./observe";

/**
 * After a manifestation ends: process the transcript tail, write the briefing,
 * mark it briefed. Re-running on an already briefed manifestation returns the stored briefing.
 */
export async function brief(
  d: Deps,
  id: ManifestationId,
): Promise<StoredBriefing> {
  const existing = await d.repos.briefings.get(id);
  if (existing) {
    // A retry after the briefing saved but before the status moved: finish the move.
    const m = await d.repos.manifestations.get(id);
    if (m?.status === "ended") await applyTransition(d, id, "brief");
    return existing;
  }

  await observe(d, id, { force: true });
  const ctx = await loadContext(d, id);
  const observations = await d.repos.observations.byManifestation(id);
  if (observations.length === 0) {
    // Nothing to brief from: say so plainly instead of asking a model to write about nothing.
    const empty: StoredBriefing = {
      headline: [],
      followUps: [],
      openQuestions: [],
      markdown: "Nothing worth noting was captured in this session.",
      cites: { headline: [], followUps: [] },
      manifestationId: id,
      createdAt: d.now(),
    };
    await d.repos.briefings.save(empty);
    if (ctx.manifestation.status === "ended")
      await applyTransition(d, id, "brief");
    return empty;
  }
  const memories = await recallMemory(
    d,
    ctx.agent.id,
    observations.map((o) => o.text).join(" "),
  );
  const { remember, ...briefing } = await d.agent.brief({
    ...ctx,
    memories,
    observations,
  });

  const stored: StoredBriefing = {
    ...briefing,
    manifestationId: id,
    createdAt: d.now(),
  };
  await d.repos.briefings.save(stored);
  // Only notes from this session can back what it proposes to remember.
  const mine = new Set(observations.map((o) => o.id));
  await proposeHeard(
    d,
    ctx.agent.id,
    id,
    remember
      .map((r) => ({ ...r, evidence: r.evidence.filter((e) => mine.has(e)) }))
      .filter((r) => r.evidence.length > 0),
  );
  if (ctx.manifestation.status === "ended")
    await applyTransition(d, id, "brief");
  // After the briefing is visible: look across events for what to do next. A failure
  // here costs suggestions, never the briefing.
  await reflect(d, id).catch((e) => console.error("reflect failed", e));
  return stored;
}
