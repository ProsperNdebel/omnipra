import {
  DomainError,
  type AgentId,
  type EncounterId,
  type EventId,
  type ISODate,
} from "./ids";

/**
 * Two people's agents at the same event. Each reads only the other's card and judges
 * whether its own owner should know that person. An introduction needs both owners.
 */
export interface Encounter {
  id: EncounterId;
  eventId: EventId;
  eventTitle: string;
  sides: [EncounterSide, EncounterSide];
  status: "open" | "introduced" | "declined";
  createdAt: ISODate;
  resolvedAt: ISODate | null;
}

export interface EncounterSide {
  agentId: AgentId;
  /** The other side's card name, as this side sees them. */
  metName: string;
  /** The other side's public card text, as it was when they met. */
  metAbout: string;
  /** This agent's read: should its owner know them, and why. */
  relevant: boolean;
  why: string;
  /** This owner's answer to an introduction. */
  answer: "pending" | "yes" | "no";
}

/** Which side of an encounter an agent is on. */
export function sideOf(e: Encounter, agentId: AgentId): 0 | 1 {
  if (e.sides[0].agentId === agentId) return 0;
  if (e.sides[1].agentId === agentId) return 1;
  throw new DomainError("forbidden", "Not your encounter.");
}

/**
 * Pure. One owner answers. Both yes: introduced. Any no: declined, and the other side
 * learns nothing beyond that it didn't happen.
 */
export function answerEncounter(
  e: Encounter,
  agentId: AgentId,
  answer: "yes" | "no",
  now: ISODate,
): Encounter {
  if (e.status !== "open")
    throw new DomainError("invalid_transition", `That is already ${e.status}.`);
  const i = sideOf(e, agentId);
  const sides = [...e.sides] as Encounter["sides"];
  sides[i] = { ...sides[i], answer };
  const status =
    answer === "no"
      ? "declined"
      : sides.every((s) => s.answer === "yes")
        ? "introduced"
        : "open";
  return {
    ...e,
    sides,
    status,
    resolvedAt: status === "open" ? null : now,
  };
}
