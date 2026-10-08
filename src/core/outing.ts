import {
  DomainError,
  type AgentId,
  type EventId,
  type ISODate,
  type ManifestationId,
  type OutingId,
  type UserId,
} from "./ids";

/**
 * The agent deciding where it should be. The owner gives a brief and a budget; the
 * agent ranks what's on, picks hosts, writes each mission, and proposes the lot.
 * Nothing is booked until the owner approves.
 */
export interface Outing {
  id: OutingId;
  agentId: AgentId;
  /** What the owner asked for, in their words. */
  request: string;
  budgetCents: number;
  /** The window it looked at. */
  from: ISODate;
  to: ISODate;
  picks: OutingPick[];
  /** Events it looked at and passed on, with why, so the owner can overrule. */
  skipped: { eventId: EventId; title: string; why: string }[];
  status: "proposed" | "booked" | "dismissed";
  /** Sessions created when booked. */
  manifestationIds: ManifestationId[];
  createdAt: ISODate;
  decidedAt: ISODate | null;
}

export interface OutingPick {
  eventId: EventId;
  eventTitle: string;
  startsAt: ISODate;
  hostId: UserId;
  hostName: string;
  priceCents: number;
  /** Why this event, for this owner. */
  why: string;
  /** The mission it will carry there. */
  instructions: string;
}

export const outingTotal = (o: Pick<Outing, "picks">) =>
  o.picks.reduce((sum, p) => sum + p.priceCents, 0);

/**
 * Pure. The budget rule: keep picks in the agent's order of preference while they
 * fit, one host per event. Whatever doesn't fit is moved to skipped, saying so.
 */
export function fitBudget(
  picks: OutingPick[],
  budgetCents: number,
): { picks: OutingPick[]; overBudget: OutingPick[] } {
  const kept: OutingPick[] = [];
  const overBudget: OutingPick[] = [];
  let spent = 0;
  for (const p of picks) {
    if (kept.some((k) => k.eventId === p.eventId)) continue;
    if (spent + p.priceCents > budgetCents) {
      overBudget.push(p);
      continue;
    }
    kept.push(p);
    spent += p.priceCents;
  }
  return { picks: kept, overBudget };
}

export function decideOuting(
  o: Outing,
  op: "book" | "dismiss",
  now: ISODate,
  manifestationIds: ManifestationId[] = [],
): Outing {
  if (o.status !== "proposed")
    throw new DomainError(
      "invalid_transition",
      `That plan is already ${o.status}.`,
    );
  return {
    ...o,
    status: op === "book" ? "booked" : "dismissed",
    manifestationIds,
    decidedAt: now,
  };
}
