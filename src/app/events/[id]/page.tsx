import Link from "next/link";
import { notFound } from "next/navigation";
import { attendAction } from "@/app/actions";
import { cancelWishAction, takeWishAction } from "@/app/wish-actions";
import { DomainError, type EventId, type ManifestationStatus } from "@/core";
import {
  eventHostRequests,
  eventWishes,
  eventWithHosts,
  hostDevices,
} from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { fmtDay, fmtRange, money } from "@/ui/format";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const POLICY: Record<string, string> = {
  organizer: "The organizer approved agents at this event.",
  public_talk:
    "Talks on stage may be recorded. Agents listen to the stage, not private conversations.",
  none: "This event doesn't allow recording, so agents can't attend.",
};

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; listed?: string; requested?: string }>;
}) {
  const [{ id }, { error, listed, requested }] = await Promise.all([
    params,
    searchParams,
  ]);
  const data = await eventWithHosts(getDeps(), id as EventId).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });
  const { event, listings } = data;
  const me = await viewerId();
  const [devices, wishes, requests] = await Promise.all([
    hostDevices(getDeps(), me),
    eventWishes(getDeps(), event.id),
    eventHostRequests(getDeps(), event.id, me),
  ]);
  const mine = listings.find((l) => l.hostId === me);
  const others = listings.filter((l) => l.hostId !== me);
  const ownWish = wishes.find(({ wish }) => wish.ownerId === me);
  const otherWishes = wishes.filter(({ wish }) => wish.ownerId !== me);
  const requestByHost = new Map(requests.map((r) => [r.hostId, r]));
  const open = event.capturePolicy !== "none";

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">{event.title}</h1>
        <p>
          {fmtDay(event.startsAt)}, {fmtRange(event.startsAt, event.endsAt)}
          {event.venue && <>, {event.venue}</>}
        </p>
        {event.sourceUrl && (
          <p>
            <a href={event.sourceUrl} target="_blank" rel="noreferrer">
              Event page
            </a>
          </p>
        )}
        <p className="muted">{POLICY[event.capturePolicy]}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {open && (
          <div className="event-options">
            <section className="event-option event-option-owner">
              <div className="event-option-label">For agent owners</div>
              <h2>Need a host?</h2>
              <p className="muted">
                Have someone at this event carry your agent for you.
              </p>

              {requested && (
                <p>
                  Request posted. It stays open until someone takes it or you
                  withdraw it.
                </p>
              )}

              {ownWish && (
                <div className="event-request">
                  <div>
                    <strong>Request pending</strong>
                    <div className="small muted">
                      Up to {money(ownWish.wish.maxPriceCents)}
                    </div>
                  </div>
                  <form action={cancelWishAction}>
                    <input type="hidden" name="id" value={ownWish.wish.id} />
                    <input
                      type="hidden"
                      name="back"
                      value={`/events/${event.id}`}
                    />
                    <SubmitButton quiet pending="Withdrawing">
                      Withdraw request
                    </SubmitButton>
                  </form>
                </div>
              )}

              {others.length > 0 ? (
                <>
                  <h3 className="event-option-subhead">Available hosts</h3>
                  <ul className="rows">
                    {others.map((l) => {
                      const request = requestByHost.get(l.hostId);
                      return (
                        <li key={l.hostId}>
                          <div>
                            <div>{l.displayName}</div>
                            <div className="small muted">
                              {l.openToRequests
                                ? "Microphone, takes requests in the room"
                                : "Microphone"}
                            </div>
                          </div>
                          <div
                            className="actions"
                            style={{ alignItems: "baseline" }}
                          >
                            <span>{money(l.priceCents)}</span>
                            <Link
                              className={request ? "button quiet" : "button"}
                              href={
                                request
                                  ? `/m/${request.manifestationId}`
                                  : `/send/${event.id}/${l.hostId}`
                              }
                            >
                              {request
                                ? requestWord(request.status)
                                : "Request host"}
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {!ownWish && (
                    <p className="small muted" style={{ marginTop: 16 }}>
                      None of these work?{" "}
                      <Link href={`/request/${event.id}`}>Ask for a host</Link>.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="muted">Nobody is hosting yet.</p>
                  {!ownWish && (
                    <p>
                      <Link className="button" href={`/request/${event.id}`}>
                        Ask for a host
                      </Link>
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="event-option event-option-host">
              <div className="event-option-label">For attendees</div>
              <h2>{mine ? "You’re hosting" : "Going in person?"}</h2>
              <p className="muted">
                List yourself so people who can’t make it can send their agent
                through your phone.
              </p>

              {listed && <p>You&rsquo;re listed. Requests show up under Hosting.</p>}

              <form
                action={attendAction}
                className="stack"
                style={{ marginTop: 24 }}
              >
                <input type="hidden" name="eventId" value={event.id} />
                <label className="field">
                  <span>Name agent owners see</span>
                  <input
                    type="text"
                    name="displayName"
                    required
                    maxLength={40}
                    defaultValue={mine?.displayName}
                    placeholder="Jordan M."
                  />
                </label>
                <label className="field">
                  <span>Price per session, in dollars</span>
                  <input
                    type="number"
                    name="price"
                    required
                    min={0}
                    step={1}
                    inputMode="numeric"
                    defaultValue={mine ? mine.priceCents / 100 : 20}
                  />
                </label>
                <label
                  style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                >
                  <input
                    type="checkbox"
                    name="openToRequests"
                    defaultChecked={mine?.openToRequests ?? true}
                    style={{ marginTop: 4, flex: "none" }}
                  />
                  <span>
                    I&rsquo;ll take quick requests from the agent
                    <span className="small muted" style={{ display: "block" }}>
                      Like putting a question to a speaker during Q&amp;A.
                    </span>
                  </span>
                </label>
                {devices.filter((x) => x.kind !== "phone_web").length > 0 && (
                  <label className="field">
                    <span>Carry agents on</span>
                    <select
                      name="endpointId"
                      defaultValue={mine?.endpointId ?? ""}
                    >
                      <option value="">My phone</option>
                      {devices
                        .filter((x) => x.kind !== "phone_web")
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name} ({x.capabilities.join(", ")})
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <div className="actions">
                  <SubmitButton pending={mine ? "Updating" : "Listing you"}>
                    {mine ? "Update listing" : "I’m attending"}
                  </SubmitButton>
                  {mine && (
                    <Link
                      className="button quiet"
                      href={`/send/${event.id}/${me}`}
                    >
                      Send my own agent through me
                    </Link>
                  )}
                </div>
                <small className="muted">
                  Use this same phone at the event.
                </small>
              </form>

              {otherWishes.length > 0 && (
                <>
                  <h3 className="event-option-subhead">Agents looking for a host</h3>
                  <ul className="rows">
                    {otherWishes.map(({ wish, agentName }) => {
                      const tooHigh =
                        !!mine && mine.priceCents > wish.maxPriceCents;
                      return (
                        <li key={wish.id}>
                          <div>
                            <div>{agentName}</div>
                            <div className="small muted">
                              Up to {money(wish.maxPriceCents)}
                              {tooHigh && ", below your price"}
                            </div>
                          </div>
                          {mine ? (
                            <form action={takeWishAction}>
                              <input type="hidden" name="id" value={wish.id} />
                              <input
                                type="hidden"
                                name="back"
                                value={`/events/${event.id}`}
                              />
                              <SubmitButton pending="Taking it">
                                Take it
                              </SubmitButton>
                            </form>
                          ) : (
                            <span className="small muted">
                              List yourself above to take it
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function requestWord(status: ManifestationStatus): string {
  if (status === "requested") return "Request pending";
  if (status === "declined" || status === "cancelled") return "Request cancelled";
  return "Request confirmed";
}
