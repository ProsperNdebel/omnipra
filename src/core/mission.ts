import type { ContextScope } from "./agent";
import type { Capability } from "./endpoint";
import type { AgentId, EventId, ISODate, MemoryId, MissionId } from "./ids";
import type { Autonomy } from "./presence";

/**
 * What the agent should do at one event. The agent's profile is permanent;
 * the mission is the specific ask for this place and time.
 * One mission can have several manifestations (more than one host in the same room).
 */
export interface Mission {
  id: MissionId;
  agentId: AgentId;
  eventId: EventId;
  instructions: string;
  /** Things worth interrupting the owner for, e.g. "anyone mentions African markets". */
  alerts: string[];
  context: ContextScope[];
  requires: Capability[];
  /** Whether the agent's asks go to the host directly or wait for the owner. */
  autonomy: Autonomy;
  /** What the owner told the agent during the session. Added to the mission, newest last. */
  orders: string[];
  /**
   * How the agent means to serve its owner's goals at this event, drafted before it
   * goes. Null until drafted; empty if nothing here touches a goal.
   */
  plan: PlanItem[] | null;
  createdAt: ISODate;
}

/** One thing to watch for, and which standing goal it serves. */
export interface PlanItem {
  /** Short and stable, so notes can say which item they advance. */
  id: string;
  /** The goal memory this serves. Null when it serves this mission's own instructions. */
  goalId: MemoryId | null;
  /** The goal in words, kept so the plan still reads right if the goal is later edited. */
  goal: string;
  /** What to listen for or do here. */
  watchFor: string;
}

const MAX_PLAN_ITEMS = 6;

/** Pure. Trims, drops empty items, caps length, and gives new items ids. */
export function cleanPlan(
  items: {
    id?: string;
    goalId: MemoryId | null;
    goal: string;
    watchFor: string;
  }[],
  newId: () => string,
): PlanItem[] {
  return items
    .map((i) => ({
      id: i.id || newId().slice(0, 8),
      goalId: i.goalId,
      goal: i.goal.trim().slice(0, 200),
      watchFor: i.watchFor.trim().replace(/\s+/g, " ").slice(0, 300),
    }))
    .filter((i) => i.watchFor)
    .slice(0, MAX_PLAN_ITEMS);
}
