import type { ContextScope } from "./agent";
import type { Capability } from "./endpoint";
import type { AgentId, EventId, ISODate, MissionId } from "./ids";

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
  createdAt: ISODate;
}
