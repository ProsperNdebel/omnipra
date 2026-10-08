import type {
  ManifestationId,
  Observation,
  ObservationId,
  SegmentId,
} from "@/core";
import { loadContext, type Deps } from "./deps";
import { fileAsks, message, presenceInput } from "./presence";

/**
 * Wait for this much new transcript before the agent thinks. Short enough that it can
 * react to the room within about half a minute, long enough to reason over a thought
 * rather than a fragment.
 */
const MIN_WINDOW_SEC = 20;

/**
 * The agent's loop while present: read new transcript, record notes, interrupt the owner
 * when something matters now, and propose (or send) asks for the host. Safe to call from
 * every chunk upload: the cursor compare and set means exactly one caller owns each
 * window, and the rest return immediately. `force` processes a short tail (end of session).
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

  let result;
  let input;
  try {
    input = await presenceInput(d, ctx, window.map((s) => s.text).join(" "));
    result = await d.agent.observe({ ...input, window });
  } catch (err) {
    // Hand the window back so the next call retries it instead of silently skipping audio.
    await d.repos.manifestations.advanceCursor(id, to, from);
    throw err;
  }

  // The agent may only cite transcript it was shown. Anything uncited is dropped.
  const startOf = new Map(window.map((s) => [s.id, s.startSec]));
  const cited = (evidence: SegmentId[]) =>
    evidence.filter((e) => startOf.has(e));
  const saidAt = (evidence: SegmentId[]) =>
    Math.min(...evidence.map((e) => startOf.get(e)!));

  const createdAt = d.now();
  const planIds = new Set((ctx.mission.plan ?? []).map((p) => p.id));
  const observations: Observation[] = result.observations
    .map((o) => ({ ...o, evidence: cited(o.evidence) }))
    .filter((o) => o.evidence.length > 0)
    .map((o) => ({
      ...o,
      id: d.newId() as ObservationId,
      agentId: ctx.agent.id,
      manifestationId: id,
      // When it was said in the room, not when the model got to it.
      atSec: saidAt(o.evidence),
      planItem: o.planItem && planIds.has(o.planItem) ? o.planItem : null,
      createdAt,
    }));

  if (observations.length > 0) {
    await d.repos.observations.append(observations);
    await d.memory.index(observations);
  }

  // Nudges follow the same rule as notes: no transcript behind it, no interruption.
  const nudges = result.nudges
    .map((n) => ({ ...n, evidence: cited(n.evidence) }))
    .filter((n) => n.evidence.length > 0)
    .slice(0, 1)
    .map((n) =>
      message(d, ctx, {
        from: "agent",
        kind: "nudge",
        text: n.text,
        atSec: saidAt(n.evidence),
      }),
    );
  if (nudges.length > 0) await d.repos.messages.append(nudges);

  await fileAsks(d, ctx, result.asks.slice(0, 1), {
    origin: "agent",
    hostTakesRequests: input.hostTakesRequests,
  });

  return observations;
}
