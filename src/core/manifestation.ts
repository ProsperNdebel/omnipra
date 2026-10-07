import { DomainError, type EndpointId, type ISODate, type ManifestationId, type MissionId } from "./ids";

/**
 * One temporary physical presence: this mission, on this endpoint, for this window.
 * It doubles as the booking; a separate Booking type earns its place once payments get real.
 */
export interface Manifestation {
  id: ManifestationId;
  missionId: MissionId;
  endpointId: EndpointId;
  priceCents: number;
  status: ManifestationStatus;
  /** Transcript up to this second has been turned into observations. Advanced only by compare and set. */
  observedThroughSec: number;
  startedAt: ISODate | null;
  endedAt: ISODate | null;
  createdAt: ISODate;
}

export type ManifestationStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "cancelled"
  | "live"
  | "ended"
  | "briefed";

export type ManifestationEvent = "accept" | "decline" | "cancel" | "start" | "end" | "brief";

const TRANSITIONS: Record<ManifestationStatus, Partial<Record<ManifestationEvent, ManifestationStatus>>> = {
  requested: { accept: "accepted", decline: "declined", cancel: "cancelled" },
  accepted: { start: "live", cancel: "cancelled" },
  live: { end: "ended" },
  ended: { brief: "briefed" },
  declined: {},
  cancelled: {},
  briefed: {},
};

/** Pure. Callers persist the result; nothing else is allowed to set `status`. */
export function transition(m: Manifestation, event: ManifestationEvent, now: ISODate): Manifestation {
  const next = TRANSITIONS[m.status][event];
  if (!next) {
    throw new DomainError("invalid_transition", `cannot ${event} a manifestation that is ${m.status}`);
  }
  return {
    ...m,
    status: next,
    startedAt: event === "start" ? now : m.startedAt,
    endedAt: event === "end" ? now : m.endedAt,
  };
}

export const isActive = (m: Pick<Manifestation, "status">) => m.status === "live";
