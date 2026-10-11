import type { AgentId, EventId, ISODate, ManifestationId, UserId } from "./ids";
import type { Autonomy } from "./presence";

/**
 * "I want my agent at this event, whoever's going." An open request on an event with
 * no host yet (or none the owner picked). A host who lists for the event can take it,
 * which turns it into an ordinary booking with them.
 */
export interface Wish {
  id: string;
  ownerId: UserId;
  agentId: AgentId;
  eventId: EventId;
  instructions: string;
  alerts: string[];
  autonomy: Autonomy;
  /** The most the owner will pay a host for this session. */
  maxPriceCents: number;
  status: WishStatus;
  /** The booking it became, once a host took it. */
  manifestationId: ManifestationId | null;
  createdAt: ISODate;
}

export type WishStatus = "open" | "taken" | "cancelled";
