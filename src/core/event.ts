import type { Capability } from "./endpoint";
import type { EndpointId, EventId, ISODate, UserId } from "./ids";

export interface PresenceEvent {
  id: EventId;
  title: string;
  startsAt: ISODate;
  endsAt: ISODate;
  venue: string | null;
  sourceUrl: string | null;
  /** What the organizer allows. Capture is only offered when this is not "none". */
  capturePolicy: CapturePolicy;
}

/**
 * organizer: the organizer authorized agent capture.
 * public_talk: on stage content where recording is allowed.
 * none: no capture; listings still exist so hosts can do non recording tasks later.
 */
export type CapturePolicy = "organizer" | "public_talk" | "none";

/** "I'm attending, and I'll host agents." The supply side of the marketplace. */
export interface HostListing {
  eventId: EventId;
  hostId: UserId;
  /** How the host appears to agent owners, e.g. "Sarah M." */
  displayName: string;
  endpointId: EndpointId;
  offers: Capability[];
  priceCents: number;
  createdAt: ISODate;
}
