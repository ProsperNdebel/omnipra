import { notFound, redirect } from "next/navigation";
import { sendAgentAction } from "@/app/actions";
import type { EventId } from "@/core";
import { eventWithHosts, ownerAgent } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { Bar } from "@/ui/bar";
import { fmtDay, fmtRange, money } from "@/ui/format";

export const dynamic = "force-dynamic";

export default async function Send({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; hostId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ eventId, hostId }, { error }] = await Promise.all([params, searchParams]);
  const d = getDeps();
  const agent = await ownerAgent(d, await viewerId());
  if (!agent) redirect(`/agent/new?next=${encodeURIComponent(`/send/${eventId}/${hostId}`)}`);

  const { event, listings } = await eventWithHosts(d, eventId as EventId).catch(() => notFound());
  const listing = listings.find((l) => l.hostId === hostId);
  if (!listing) notFound();

  return (
    <main className="page">
      <Bar here="explore" />
      <div className="narrow">
        <h1 className="title">Send {agent.name}</h1>
        <p>
          To {event.title}, {fmtDay(event.startsAt)}, {fmtRange(event.startsAt, event.endsAt)}.
          <br />
          Through {listing.displayName}&rsquo;s phone microphone, for {money(listing.priceCents)}.
        </p>
        {error && <p className="error" role="alert">{error}</p>}

        <form action={sendAgentAction} className="stack">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="hostId" value={listing.hostId} />
          <label className="field">
            <span>What should {agent.name} do here?</span>
            <textarea
              name="instructions"
              required
              placeholder="Capture any inference pricing. Note which companies work on low resource languages. Tell me which founders I should talk to."
            />
            <small>{agent.name} already knows what you care about. This is for this event specifically.</small>
          </label>
          <label className="field">
            <span>Flag it right away if</span>
            <textarea name="alerts" style={{ minHeight: "5rem" }} placeholder={"Anyone mentions African markets\nA speaker says they're hiring"} />
            <small>One per line. Optional.</small>
          </label>
          <button className="button" type="submit">
            Send {agent.name} for {money(listing.priceCents)}
          </button>
          <small className="muted">
            {listing.displayName} has to accept, and only starts {agent.name} once they&rsquo;re in the room. Payment is settled
            directly with the host for now.
          </small>
        </form>
      </div>
    </main>
  );
}
