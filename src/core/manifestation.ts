import {
  DomainError,
  type EndpointId,
  type ISODate,
  type ManifestationId,
  type MissionId,
} from "./ids";

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
  /** When the host confirmed recording is allowed where they are. Required to start. */
  captureConfirmedAt: ISODate | null;
  startedAt: ISODate | null;
  endedAt: ISODate | null;
  /** When the body last sent anything. Written only by `heard`, so status saves never race it. */
  lastHeardAt: ISODate | null;
  createdAt: ISODate;
}

/** No audio or images for this long while live: the owner is told the room went quiet. */
export const STALE_AFTER_SEC = 90;
/** No audio or images for this long while live: the session is treated as abandoned and ended. */
export const ABANDONED_AFTER_SEC = 15 * 60;

/** How long a live session has been without input, or null if it isn't live or hasn't started sending. */
export function silentForSec(
  m: Pick<Manifestation, "status" | "lastHeardAt" | "startedAt">,
  now: ISODate,
): number | null {
  if (m.status !== "live") return null;
  const last = m.lastHeardAt ?? m.startedAt;
  return last ? Math.max(0, (Date.parse(now) - Date.parse(last)) / 1000) : null;
}

export type ManifestationStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "cancelled"
  | "live"
  | "ended"
  | "briefed";

export type ManifestationEvent =
  "accept" | "decline" | "cancel" | "start" | "end" | "brief";

const TRANSITIONS: Record<
  ManifestationStatus,
  Partial<Record<ManifestationEvent, ManifestationStatus>>
> = {
  requested: { accept: "accepted", decline: "declined", cancel: "cancelled" },
  accepted: { start: "live", cancel: "cancelled" },
  live: { end: "ended" },
  ended: { brief: "briefed" },
  declined: {},
  cancelled: {},
  briefed: {},
};

/** Facts a transition can need beyond the event itself. */
export interface TransitionInput {
  /** The host confirmed recording is allowed here and people nearby know. */
  captureConfirmed?: boolean;
}

/** Pure. Callers persist the result; nothing else is allowed to set `status`. */
export function transition(
  m: Manifestation,
  event: ManifestationEvent,
  now: ISODate,
  input: TransitionInput = {},
): Manifestation {
  const next = TRANSITIONS[m.status][event];
  if (!next) {
    throw new DomainError(
      "invalid_transition",
      `cannot ${event} a manifestation that is ${m.status}`,
    );
  }
  // Capture needs an explicit confirmation from the host, every session.
  if (event === "start" && !input.captureConfirmed) {
    throw new DomainError(
      "capture_not_confirmed",
      "Confirm that recording is allowed here before starting.",
    );
  }
  return {
    ...m,
    status: next,
    captureConfirmedAt: event === "start" ? now : m.captureConfirmedAt,
    startedAt: event === "start" ? now : m.startedAt,
    endedAt: event === "end" ? now : m.endedAt,
  };
}

export const isActive = (m: Pick<Manifestation, "status">) =>
  m.status === "live";
