import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requestAgentAction } from "@/app/wish-actions";
import type { EventId } from "@/core";
import { eventWithHosts, ownerAgents } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { fmtDay, fmtRange } from "@/ui/format";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

/** Ask for a host at an event nobody (or nobody you want) is hosting yet. */
export default async function RequestHost({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ eventId }, { error }] = await Promise.all([params, searchParams]);
  const here = `/request/${eventId}`;
  const d = getDeps();
  const [agents, data] = await Promise.all([
    viewerId().then((v) => ownerAgents(d, v)),
    eventWithHosts(d, eventId as EventId).catch(() => null),
  ]);
  if (agents.length === 0) redirect(`/agent/new?next=${encodeURIComponent(here)}`);
  if (!data) notFound();
  const { event } = data;
  const only = agents.length === 1 ? agents[0]! : null;
  const it = only?.name ?? "your agent";

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Find a host for {it}</h1>
        <p>
          {event.title}, {fmtDay(event.startsAt)},{" "}
          {fmtRange(event.startsAt, event.endsAt)}.
        </p>
        <p className="muted">
          Your request waits on this event. The first person going who takes it
          carries {it} in, at their price up to your limit. You&rsquo;ll see it
          under Your agents once someone does.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <form action={requestAgentAction} className="stack">
          <input type="hidden" name="eventId" value={event.id} />
          {only ? (
            <input type="hidden" name="agentId" value={only.id} />
          ) : (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <span>Which agent?</span>
              <div className="choices" role="radiogroup">
                {agents.map((a, i) => (
                  <label key={a.id}>
                    <input type="radio" name="agentId" value={a.id} defaultChecked={i === 0} required />
                    {a.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="field">
            <span>What should {it} do here?</span>
            <textarea
              name="instructions"
              required
              placeholder="Note which investors are on the panel and what they say they're looking for. Tell me who I should follow up with."
            />
          </label>
          <label className="field">
            <span>Flag it right away if</span>
            <textarea
              name="alerts"
              style={{ minHeight: "5rem" }}
              placeholder={"Someone mentions agent marketplaces\nA speaker says they're hiring"}
            />
            <small>One per line. Optional.</small>
          </label>
          <label className="field">
            <span>The most you&rsquo;ll pay, in dollars</span>
            <input type="number" name="maxPrice" required min={0} step={1} inputMode="numeric" defaultValue={25} />
            <small>Hosts at or under this can take it.</small>
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <span>When {it} wants something asked in the room</span>
            <div className="choices" role="radiogroup">
              <label>
                <input type="radio" name="autonomy" value="ask_first" defaultChecked />
                Check with me first
              </label>
              <label>
                <input type="radio" name="autonomy" value="act" />
                Let it ask the host directly
              </label>
            </div>
            <small>Only applies if the host takes requests.</small>
          </fieldset>
          <SubmitButton pending="Posting">Post the request</SubmitButton>
          <small>
            <Link href={`/events/${event.id}`}>Back to the event</Link>
          </small>
        </form>
      </div>
    </main>
  );
}
