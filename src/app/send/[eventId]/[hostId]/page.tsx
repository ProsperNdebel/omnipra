import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sendAgentAction } from "@/app/actions";
import type { EventId } from "@/core";
import { eventWithHosts, ownerAgents } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { fmtDay, fmtRange, money } from "@/ui/format";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function Send({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; hostId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ eventId, hostId }, { error }] = await Promise.all([
    params,
    searchParams,
  ]);
  const here = `/send/${eventId}/${hostId}`;
  const d = getDeps();
  const [agents, eventData] = await Promise.all([
    viewerId().then((v) => ownerAgents(d, v)),
    eventWithHosts(d, eventId as EventId).catch(() => null),
  ]);
  if (agents.length === 0)
    redirect(`/agent/new?next=${encodeURIComponent(here)}`);
  if (!eventData) notFound();
  const { event, listings } = eventData;
  const listing = listings.find((l) => l.hostId === hostId);
  if (!listing) notFound();

  // With one agent, speak about it by name. With several, the picker decides.
  const only = agents.length === 1 ? agents[0]! : null;
  const it = only?.name ?? "your agent";

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">
          {only ? `Send ${only.name}` : "Send an agent"}
        </h1>
        <p>
          To {event.title}, {fmtDay(event.startsAt)},{" "}
          {fmtRange(event.startsAt, event.endsAt)}.
          <br />
          Through {listing.displayName}&rsquo;s phone microphone, for{" "}
          {money(listing.priceCents)}.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <form action={sendAgentAction} className="stack">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="hostId" value={listing.hostId} />

          {only ? (
            <input type="hidden" name="agentId" value={only.id} />
          ) : (
            <fieldset
              className="field"
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <span>Which agent?</span>
              <div style={{ display: "grid", gap: 14, marginTop: 4 }}>
                {agents.map((a, i) => (
                  <label
                    key={a.id}
                    style={{ display: "flex", gap: 12, alignItems: "baseline" }}
                  >
                    <input
                      type="radio"
                      name="agentId"
                      value={a.id}
                      defaultChecked={i === 0}
                      required
                      style={{ accentColor: "var(--ink)" }}
                    />
                    <span>
                      <span style={{ fontWeight: 600 }}>{a.name}</span>
                      <span
                        className="small muted"
                        style={{ display: "block" }}
                      >
                        {a.profile.split("\n")[0]}
                      </span>
                    </span>
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
              placeholder="Capture any inference pricing. Note which companies work on low resource languages. Tell me which founders I should talk to."
            />
            <small>
              {only ? only.name : "Your agent"} already knows what you care
              about. This is for this event specifically.
            </small>
          </label>
          <label className="field">
            <span>Flag it right away if</span>
            <textarea
              name="alerts"
              style={{ minHeight: "5rem" }}
              placeholder={
                "Anyone mentions African markets\nA speaker says they're hiring"
              }
            />
            <small>One per line. Optional.</small>
          </label>
          {listing.openToRequests ? (
            <fieldset
              className="field"
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <span>When {it} wants something asked in the room</span>
              <label
                style={{ display: "flex", gap: 12, alignItems: "baseline" }}
              >
                <input
                  type="radio"
                  name="autonomy"
                  value="ask_first"
                  defaultChecked
                />
                <span>Check with me first</span>
              </label>
              <label
                style={{ display: "flex", gap: 12, alignItems: "baseline" }}
              >
                <input type="radio" name="autonomy" value="act" />
                <span>Let it ask {listing.displayName} directly</span>
              </label>
              <small>
                {listing.displayName} takes quick requests, like putting a
                question to a speaker. You can change this during the session.
              </small>
            </fieldset>
          ) : (
            <input type="hidden" name="autonomy" value="ask_first" />
          )}
          <SubmitButton pending="Sending">
            Send {only ? only.name : "agent"} for {money(listing.priceCents)}
          </SubmitButton>
          <small className="muted">
            {listing.displayName} has to accept, and only starts {it} once
            they&rsquo;re in the room. Payment is settled directly with the host
            for now.
          </small>
          <small>
            <Link href={`/agent/new?next=${encodeURIComponent(here)}`}>
              Make a new agent for this
            </Link>
          </small>
        </form>
      </div>
    </main>
  );
}
