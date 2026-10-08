import type { ManifestationId, Observation, ObservationId } from "@/core";
import { loadContext, type Deps } from "./deps";

/** Wait for this much new transcript before calling the agent, so it reasons over context, not fragments. */
const MIN_WINDOW_SEC = 45;
/** How many of this manifestation's recent observations the agent sees, to avoid repeating itself. */
const RECENT_LIMIT = 20;

/**
 * Turn new transcript into observations. Safe to call from every chunk upload:
 * the cursor compare and set means exactly one caller owns each window, and the
 * rest return immediately. `force` processes a short tail (used at end of session).
 */
export async function observe(
  d: Deps,
  id: ManifestationId,
  opts: { force?: boolean } = {},
): Promise<Observation[]> {
  const ctx = await loadContext(d, id);
  const from = ctx.manifestation.observedThroughSec;
  const window = await d.repos.segments.since(id, from);
  if (window.length === 0) return [];

  const to = Math.max(...window.map((s) => s.endSec));
  if (!opts.force && to - from < MIN_WINDOW_SEC) return [];
  if (!(await d.repos.manifestations.advanceCursor(id, from, to))) return [];

  let found;
  try {
    const recent = (await d.repos.observations.byManifestation(id)).slice(
      -RECENT_LIMIT,
    );
    found = await d.agent.observe({ ...ctx, window, recent });
  } catch (err) {
    // Hand the window back so the next call retries it instead of silently skipping audio.
    await d.repos.manifestations.advanceCursor(id, to, from);
    throw err;
  }

  // The agent may only cite transcript it was shown. Anything uncited is dropped.
  const startOf = new Map(window.map((s) => [s.id, s.startSec]));
  const shown = new Set(startOf.keys());
  const createdAt = d.now();
  const observations: Observation[] = found
    .map((o) => ({ ...o, evidence: o.evidence.filter((e) => shown.has(e)) }))
    .filter((o) => o.evidence.length > 0)
    .map((o) => ({
      ...o,
      id: d.newId() as ObservationId,
      agentId: ctx.agent.id,
      manifestationId: id,
      // When it was said in the room, not when the model got to it.
      atSec: Math.min(...o.evidence.map((e) => startOf.get(e)!)),
      createdAt,
    }));

  if (observations.length > 0) {
    await d.repos.observations.append(observations);
    await d.memory.index(observations);
  }
  return observations;
}
