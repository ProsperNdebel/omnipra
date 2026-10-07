import Link from "next/link";
import { notFound } from "next/navigation";
import { attendAction } from "@/app/actions";
import { DomainError, type EventId } from "@/core";
import { eventWithHosts } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { Bar } from "@/ui/bar";
import { fmtDay, fmtRange, money } from "@/ui/format";

export const dynamic = "force-dynamic";

const POLICY: Record<string, string> = {
  organizer: "The organizer approved agents at this event.",
  public_talk: "Talks on stage may be recorded. Agents listen to the stage, not private conversations.",
  none: "This event doesn't allow recording, so agents can't attend.",
};

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; listed?: string }>;
}) {
  const [{ id }, { error, listed }] = await Promise.all([params, searchParams]);
  const data = await eventWithHosts(getDeps(), id as EventId).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });
  const { event, listings } = data;
  const me = await viewerId();
  const mine = listings.find((l) => l.hostId === me);
  const others = listings.filter((l) => l.hostId !== me);
  const open = event.capturePolicy !== "none";

  return (
    <main className="page">
      <Bar here="explore" />
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
        {error && <p className="error" role="alert">{error}</p>}

        {open && (
          <>
            <h2 className="section">People hosting agents</h2>
            {others.length === 0 ? (
              <p className="muted">Nobody here is hosting yet.</p>
            ) : (
              <ul className="rows">
                {others.map((l) => (
                  <li key={l.hostId}>
                    <div>
                      <div>{l.displayName}</div>
                      <div className="small muted">Microphone</div>
                    </div>
                    <div className="actions" style={{ alignItems: "baseline" }}>
                      <span>{money(l.priceCents)}</span>
                      <Link className="button" href={`/send/${event.id}/${l.hostId}`}>
                        Send my agent
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="section">{mine ? "You\u2019re hosting" : "Going to this?"}</h2>
            {listed && <p>You&rsquo;re listed. Requests show up under Hosting.</p>}
            {!mine && (
              <p className="muted">List yourself and people who can&rsquo;t make it can send their agent through your phone.</p>
            )}
            <form action={attendAction} className="stack" style={{ marginTop: 20 }}>
              <input type="hidden" name="eventId" value={event.id} />
              <label className="field">
                <span>Name agent owners see</span>
                <input type="text" name="displayName" required maxLength={40} defaultValue={mine?.displayName} placeholder="Sarah M." />
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
              <div className="actions">
                <button className="button" type="submit">
                  {mine ? "Update listing" : "I\u2019m attending"}
                </button>
                {mine && (
                  <Link className="button quiet" href={`/send/${event.id}/${me}`}>
                    Send my own agent through me
                  </Link>
                )}
              </div>
              <small className="muted">
                Use this same phone at the event. Your agent sessions are tied to this browser.
              </small>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
