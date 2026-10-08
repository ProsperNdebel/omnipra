import {
  cleanPlan,
  DomainError,
  type Agent,
  type ManifestationId,
  type MemoryId,
  type UserId,
} from "@/core";
import { draftPlan, type Deps } from "@/pipeline";
import { access } from "./access";

/** A plan can change until the agent leaves the room. */
const EDITABLE = new Set(["requested", "accepted", "live"]);

/**
 * The owner rewrites what the agent watches for. Existing items keep the goal they
 * serve; a new line serves the owner's own instruction.
 */
export async function editPlan(
  d: Deps,
  viewer: UserId,
  manifestationId: string,
  input: { items: { id: string; watchFor: string }[]; added: string },
) {
  const a = await access(d, manifestationId as ManifestationId, viewer);
  if (!a.isOwner)
    throw new DomainError(
      "forbidden",
      "Only the agent's owner can change its plan.",
    );
  if (!EDITABLE.has(a.manifestation.status))
    throw new DomainError(
      "bad_request",
      "This session is over; its plan is final.",
    );

  const existing = new Map((a.mission.plan ?? []).map((p) => [p.id, p]));
  const kept = input.items.flatMap((i) => {
    const p = existing.get(i.id);
    return p ? [{ ...p, watchFor: i.watchFor }] : [];
  });
  const added = input.added.trim()
    ? [{ goalId: null, goal: "Added by you", watchFor: input.added }]
    : [];
  const mission = await d.repos.missions.get(a.mission.id);
  await d.repos.missions.save({
    ...(mission ?? a.mission),
    plan: cleanPlan([...kept, ...added], d.newId),
  });
}

/** Draft (or redraft) the plan now, for the owner. */
export async function replan(d: Deps, viewer: UserId, manifestationId: string) {
  const a = await access(d, manifestationId as ManifestationId, viewer);
  if (!a.isOwner)
    throw new DomainError("forbidden", "Only the agent's owner can plan.");
  if (!EDITABLE.has(a.manifestation.status))
    throw new DomainError(
      "bad_request",
      "This session is over; its plan is final.",
    );
  return draftPlan(d, a.mission.id);
}

export interface GoalProgress {
  /** Notes that advanced a plan item serving this goal. */
  notes: number;
  /** Events those notes came from. */
  events: number;
  /** Live sessions right now whose plan serves this goal. */
  watchingNow: number;
}

/** For each goal: how far the agent has got with it across every event. One pass, three queries. */
export async function goalProgress(
  d: Deps,
  agent: Agent,
): Promise<Record<string, GoalProgress>> {
  const sessions = await d.repos.manifestations.contexts({
    agentIds: [agent.id],
  });
  // Plan item ids are only unique within a mission, so key by both.
  const goalOf = new Map<string, MemoryId>();
  const progress: Record<string, GoalProgress> = {};
  const entry = (g: MemoryId) =>
    (progress[g] ??= { notes: 0, events: 0, watchingNow: 0 });
  for (const s of sessions) {
    const goals = new Set<MemoryId>();
    for (const p of s.mission.plan ?? []) {
      if (!p.goalId) continue;
      goalOf.set(`${s.mission.id}:${p.id}`, p.goalId);
      goals.add(p.goalId);
    }
    if (s.manifestation.status === "live")
      goals.forEach((g) => entry(g).watchingNow++);
  }
  if (goalOf.size === 0) return progress;

  const missionOf = new Map(
    sessions.map((s) => [s.manifestation.id, s.mission.id]),
  );
  const eventOf = new Map(
    sessions.map((s) => [s.manifestation.id, s.event.id]),
  );
  const notes = await d.repos.observations.byManifestations([
    ...missionOf.keys(),
  ]);
  const eventsPerGoal = new Map<MemoryId, Set<string>>();
  for (const n of notes) {
    if (!n.planItem) continue;
    const g = goalOf.get(`${missionOf.get(n.manifestationId)}:${n.planItem}`);
    if (!g) continue;
    entry(g).notes++;
    (eventsPerGoal.get(g) ?? eventsPerGoal.set(g, new Set()).get(g)!).add(
      eventOf.get(n.manifestationId)!,
    );
  }
  eventsPerGoal.forEach((s, g) => (entry(g).events = s.size));
  return progress;
}
