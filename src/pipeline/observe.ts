import type {
  ManifestationId,
  Observation,
  ObservationId,
  SegmentId,
} from "@/core";
import {
  currentAttention,
  groundBasis,
  nearDuplicate,
  THINK_EVERY_SEC,
} from "@/core";
import { loadContext, type Deps } from "./deps";
import { orchestrate } from "./orchestrate";
import { fileAsks, message, presenceInput } from "./presence";

/**
 * Wait for this much new transcript before the agent thinks. Short enough that it can
 * react to the room within about half a minute, long enough to reason over a thought
 * rather than a fragment. When the agent is in several rooms, rooms that matter more
 * get thought about more often (see THINK_EVERY_SEC).
 */
const MIN_WINDOW_SEC = THINK_EVERY_SEC.high;
/** The most transcript the agent reads in one go. */
const MAX_SLICE_SEC = 120;

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
  const pending = await d.repos.segments.since(id, from);
  if (pending.length === 0) return [];
  // After an outage there can be a long backlog. Think about it in slices, so one
  // prompt never balloons and nothing is skipped.
  const window = pending.filter(
    (s, i) => i === 0 || s.endSec <= from + MAX_SLICE_SEC,
  );
  const backlog = window.length < pending.length;

  const to = Math.max(...window.map((s) => s.endSec));
  if (!opts.force && to - from < MIN_WINDOW_SEC) return [];
  if (!opts.force && to - from < (await windowFor(d, ctx))) return [];
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
  const textOf = new Map(window.map((s) => [s.id, s.text]));
  const cited = (evidence: SegmentId[]) =>
    evidence.filter((e) => startOf.has(e));
  const saidAt = (evidence: SegmentId[]) =>
    Math.min(...evidence.map((e) => startOf.get(e)!));

  const createdAt = d.now();
  const planIds = new Set((ctx.mission.plan ?? []).map((p) => p.id));
  const kept: string[] = input.recent.map((n) => n.text);
  const observations: Observation[] = result.observations
    .map((o) => ({ ...o, evidence: cited(o.evidence) }))
    .filter((o) => o.evidence.length > 0)
    // A figure or quote that isn't in the cited lines can't be presented as said.
    .map((o) => ({
      ...o,
      basis: groundBasis(
        o.text,
        o.basis,
        o.evidence.map((e) => textOf.get(e)!),
      ).basis,
    }))
    // Saying again what's already noted adds nothing.
    .filter((o) => {
      if (kept.some((k) => nearDuplicate(k, o.text))) return false;
      kept.push(o.text);
      return true;
    })
    .map((o) => ({
      ...o,
      id: d.newId() as ObservationId,
      agentId: ctx.agent.id,
      manifestationId: id,
      // When it was said in the room, not when the model got to it.
      atSec: saidAt(o.evidence),
      planItem: o.planItem && planIds.has(o.planItem) ? o.planItem : null,
      hostRequestId: null,
      frames: [],
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

  // Work through the rest of a backlog straight away.
  if (backlog) {
    const more = await observe(d, id, opts).catch((e) => {
      console.error("observe backlog failed", e);
      return [];
    });
    return [...observations, ...more];
  }

  // Something new was heard: a moment to look across all the rooms it's in.
  if (observations.length > 0 && !opts.force) {
    await orchestrate(d, ctx.agent.id).catch((e) =>
      console.error("orchestrate failed", e),
    );
  }
  return observations;
}

/** How much new transcript this room needs before the agent thinks, given its current value. */
async function windowFor(
  d: Deps,
  ctx: Awaited<ReturnType<typeof loadContext>>,
): Promise<number> {
  const attention = currentAttention(
    await d.repos.attention.get(ctx.agent.id),
    d.now(),
  );
  const room = attention?.rooms.find(
    (r) => r.manifestationId === ctx.manifestation.id,
  );
  return THINK_EVERY_SEC[room?.value ?? "high"];
}
