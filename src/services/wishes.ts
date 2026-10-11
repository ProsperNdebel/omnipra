import {
  DomainError,
  type EventId,
  type Manifestation,
  type PresenceEvent,
  type UserId,
  type Wish,
} from "@/core";
import { applyTransition, recordSession, type Deps } from "@/pipeline";
import { authorizeTransition } from "./access";
import { ownedAgent } from "./agents";
import { sendAgent } from "./missions";

/**
 * "Get my agent into this event." For events nobody is hosting yet: the request waits
 * on the event, and the first host there who takes it gets an ordinary booking.
 */
export async function requestAgent(
  d: Deps,
  input: {
    ownerId: UserId;
    agentId: string;
    eventId: EventId;
    instructions: string;
    alerts: string[];
    autonomy: Wish["autonomy"];
    maxPriceCents: number;
  },
): Promise<Wish> {
  if (!input.agentId)
    throw new DomainError("bad_request", "Pick which agent to send.");
  const agent = await ownedAgent(d, input.ownerId, input.agentId);
  const event = await d.repos.events.get(input.eventId);
  if (!event) throw new DomainError("not_found", "event not found");
  if (event.endsAt < d.now())
    throw new DomainError("bad_request", "This event has already ended.");
  if (event.capturePolicy === "none")
    throw new DomainError(
      "bad_request",
      "This event doesn't allow recording, so agents can't attend it.",
    );
  if (!input.instructions.trim())
    throw new DomainError("bad_request", "Say what your agent should do there.");
  if (!Number.isFinite(input.maxPriceCents) || input.maxPriceCents < 0)
    throw new DomainError("bad_request", "Set the most you'll pay a host.");

  // One open request per agent and event: asking twice updates it.
  const already = (await d.repos.wishes.openFor([event.id])).find(
    (w) => w.agentId === agent.id,
  );
  const wish: Wish = {
    id: already?.id ?? d.newId(),
    ownerId: input.ownerId,
    agentId: agent.id,
    eventId: event.id,
    instructions: input.instructions.trim(),
    alerts: input.alerts.map((a) => a.trim()).filter(Boolean),
    autonomy: input.autonomy,
    maxPriceCents: Math.round(input.maxPriceCents),
    status: "open",
    manifestationId: null,
    createdAt: already?.createdAt ?? d.now(),
  };
  await d.repos.wishes.save(wish);
  return wish;
}

export async function cancelWish(
  d: Deps,
  ownerId: UserId,
  id: string,
): Promise<void> {
  const w = await d.repos.wishes.get(id);
  if (!w || w.ownerId !== ownerId) throw new DomainError("not_found", "request not found");
  if (w.status !== "open") return;
  await d.repos.wishes.save({ ...w, status: "cancelled" });
}

/**
 * A host listed for the event takes an open request. It becomes a booking at the host's
 * price (which can't be above what the owner offered), accepted straight away since the
 * host chose it. If the owner still has to pay, it waits for that like any request.
 */
export async function takeWish(
  d: Deps,
  hostId: UserId,
  id: string,
): Promise<{ manifestation: Manifestation; accepted: boolean }> {
  const w = await d.repos.wishes.get(id);
  if (!w || w.status !== "open")
    throw new DomainError("bad_request", "Someone already took this one, or it was withdrawn.");
  if (w.ownerId === hostId)
    throw new DomainError("bad_request", "That's your own agent. Send it through yourself from the event page.");
  const listing = (await d.repos.events.listings(w.eventId)).find((l) => l.hostId === hostId);
  if (!listing)
    throw new DomainError("bad_request", "List yourself for this event first.");
  if (listing.priceCents > w.maxPriceCents)
    throw new DomainError(
      "bad_request",
      `Your price is above what they offered ($${(w.maxPriceCents / 100).toFixed(0)}). Lower it on the event page to take this.`,
    );

  const manifestation = await sendAgent(d, {
    ownerId: w.ownerId,
    agentId: w.agentId,
    eventId: w.eventId,
    hostId,
    instructions: w.instructions,
    alerts: w.alerts,
    autonomy: w.autonomy,
  });
  await d.repos.wishes.save({ ...w, status: "taken", manifestationId: manifestation.id });

  // The host picked it, so it's accepted unless something (like payment) still blocks it.
  let accepted = false;
  try {
    const ctx = await authorizeTransition(d, manifestation.id, hostId, "accept");
    await applyTransition(d, manifestation.id, "accept");
    await recordSession(d, ctx, hostId, "session.accept");
    accepted = true;
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
  }
  return { manifestation, accepted };
}

/** A request with what a page shows next to it. */
export interface WishCard {
  wish: Wish;
  agentName: string;
  event: PresenceEvent;
}

async function cards(d: Deps, wishes: Wish[]): Promise<WishCard[]> {
  const [agents, events] = await Promise.all([
    Promise.all([...new Set(wishes.map((w) => w.agentId))].map((id) => d.repos.agents.get(id))),
    Promise.all([...new Set(wishes.map((w) => w.eventId))].map((id) => d.repos.events.get(id))),
  ]);
  const agentName = new Map(agents.flatMap((a) => (a ? [[a.id as string, a.name]] : [])));
  const eventOf = new Map(events.flatMap((e) => (e ? [[e.id as string, e]] : [])));
  return wishes.flatMap((wish) => {
    const event = eventOf.get(wish.eventId);
    return event ? [{ wish, agentName: agentName.get(wish.agentId) ?? "An agent", event }] : [];
  });
}

/** Open requests on one event, for its page. */
export async function eventWishes(d: Deps, eventId: EventId): Promise<WishCard[]> {
  return cards(d, await d.repos.wishes.openFor([eventId]));
}

/** Open requests on upcoming events this host is listed for. */
export async function openRequestsForHost(d: Deps, hostId: UserId): Promise<WishCard[]> {
  const listed = await d.repos.events.listingsByHost(hostId);
  if (listed.length === 0) return [];
  const wishes = (await d.repos.wishes.openFor(listed.map((l) => l.eventId))).filter(
    (w) => w.ownerId !== hostId,
  );
  const now = d.now();
  return (await cards(d, wishes)).filter((c) => c.event.endsAt > now);
}

/** An owner's requests still waiting for a host. */
export async function ownerWishes(d: Deps, ownerId: UserId): Promise<WishCard[]> {
  const now = d.now();
  return (await cards(d, (await d.repos.wishes.byOwner(ownerId)).filter((w) => w.status === "open"))).filter(
    (c) => c.event.endsAt > now,
  );
}

