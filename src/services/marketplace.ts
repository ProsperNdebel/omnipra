import {
  DomainError,
  type CapturePolicy,
  type Endpoint,
  type EndpointId,
  type EventId,
  type HostListing,
  type PresenceEvent,
  type UserId,
} from "@/core";
import type { Deps } from "@/pipeline";

export interface EventSummary {
  event: PresenceEvent;
  hosts: number;
  fromCents: number | null;
}

/** Events that haven't ended, starting within the next week, with their supply. */
export async function upcomingEvents(
  d: Deps,
  now = new Date(),
): Promise<EventSummary[]> {
  const to = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const events = await d.repos.events.list({
    from: now.toISOString(),
    to: to.toISOString(),
  });
  const listings = await d.repos.events.listingsFor(events.map((e) => e.id));
  return events.map((event) => {
    const prices = listings
      .filter((l) => l.eventId === event.id)
      .map((l) => l.priceCents);
    return {
      event,
      hosts: prices.length,
      fromCents: prices.length ? Math.min(...prices) : null,
    };
  });
}

export async function eventWithHosts(
  d: Deps,
  id: EventId,
): Promise<{ event: PresenceEvent; listings: HostListing[] }> {
  const [event, listings] = await Promise.all([
    d.repos.events.get(id),
    d.repos.events.listings(id),
  ]);
  if (!event) throw new DomainError("not_found", "event not found");
  return { event, listings };
}

export interface NewEvent {
  title: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  sourceUrl: string | null;
  capturePolicy: CapturePolicy;
}

export async function createEvent(
  d: Deps,
  input: NewEvent,
): Promise<PresenceEvent> {
  if (!input.title.trim())
    throw new DomainError("bad_request", "Give the event a title.");
  if (!(Date.parse(input.endsAt) > Date.parse(input.startsAt))) {
    throw new DomainError(
      "bad_request",
      "The event has to end after it starts.",
    );
  }
  const event: PresenceEvent = {
    id: d.newId() as EventId,
    ...input,
    title: input.title.trim(),
  };
  await d.repos.events.save(event);
  return event;
}

/**
 * "I'm attending." Lists the viewer as a host for this event, creating their phone
 * endpoint the first time. Listing again updates name and price.
 */
export async function attend(
  d: Deps,
  input: {
    eventId: EventId;
    hostId: UserId;
    displayName: string;
    priceCents: number;
    openToRequests: boolean;
  },
): Promise<HostListing> {
  const event = await d.repos.events.get(input.eventId);
  if (!event) throw new DomainError("not_found", "event not found");
  const displayName = input.displayName.trim();
  if (!displayName)
    throw new DomainError("bad_request", "Add the name agent owners will see.");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new DomainError("bad_request", "Set a price of $0 or more.");
  }

  const endpoint = await phoneEndpoint(d, input.hostId);
  const listing: HostListing = {
    eventId: event.id,
    hostId: input.hostId,
    displayName,
    endpointId: endpoint.id,
    offers: ["mic"],
    openToRequests: input.openToRequests,
    priceCents: input.priceCents,
    createdAt: d.now(),
  };
  await d.repos.events.saveListing(listing);
  return listing;
}

async function phoneEndpoint(d: Deps, hostId: UserId): Promise<Endpoint> {
  const existing = (await d.repos.endpoints.byHost(hostId)).find(
    (e) => e.kind === "phone_web",
  );
  if (existing) return existing;
  const endpoint: Endpoint = {
    id: d.newId() as EndpointId,
    hostId,
    kind: "phone_web",
    capabilities: ["mic"],
    createdAt: d.now(),
  };
  await d.repos.endpoints.save(endpoint);
  return endpoint;
}
