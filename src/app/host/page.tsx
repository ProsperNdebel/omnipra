import Link from "next/link";
import { decideAction } from "@/app/actions";
import { hostInbox, type ManifestationRow } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { Bar, Dot } from "@/ui/bar";
import { fmtDay, fmtRange, money } from "@/ui/format";

export const dynamic = "force-dynamic";

export default async function HostInbox({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const rows = await hostInbox(getDeps(), await viewerId());
  const requests = rows.filter((r) => r.manifestation.status === "requested");
  const upcoming = rows.filter((r) => ["accepted", "live"].includes(r.manifestation.status));
  const past = rows.filter((r) => ["ended", "briefed"].includes(r.manifestation.status));

  return (
    <main className="page">
      <Bar here="host" />
      <div className="narrow">
        <h1 className="title">Hosting</h1>
        {error && <p className="error" role="alert">{error}</p>}

        {rows.length === 0 && (
          <p>
            No requests yet. Say you&rsquo;re attending an event on its page and requests will show up here.{" "}
            <Link href="/">Find an event</Link>.
          </p>
        )}

        {requests.length > 0 && (
          <>
            <h2 className="section">Requests</h2>
            <ul className="rows">
              {requests.map((r) => (
                <li key={r.manifestation.id}>
                  <div>
                    <div>
                      {r.agentName} wants to attend {r.event.title}
                    </div>
                    <div className="small muted">
                      {fmtDay(r.event.startsAt)}, {fmtRange(r.event.startsAt, r.event.endsAt)}
                    </div>
                  </div>
                  <div>{money(r.manifestation.priceCents)}</div>
                  <div className="full">
                    <p className="small">
                      {r.agentName} will use your microphone only, and only while you have the session open. It listens to
                      the stage and writes notes for its owner. You&rsquo;ll see how much it has captured, not what.
                    </p>
                    {/* One form per decision: the clicked button's value isn't reliably sent to server actions. */}
                    <div className="actions" style={{ marginTop: 14 }}>
                      <form action={decideAction}>
                        <input type="hidden" name="id" value={r.manifestation.id} />
                        <input type="hidden" name="decision" value="accept" />
                        <button className="button">Accept {money(r.manifestation.priceCents)}</button>
                      </form>
                      <form action={decideAction}>
                        <input type="hidden" name="id" value={r.manifestation.id} />
                        <input type="hidden" name="decision" value="decline" />
                        <button className="button quiet">Decline</button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {upcoming.length > 0 && (
          <>
            <h2 className="section">Accepted</h2>
            <List rows={upcoming} />
          </>
        )}

        {past.length > 0 && (
          <>
            <h2 className="section">Done</h2>
            <List rows={past} />
          </>
        )}
      </div>
    </main>
  );
}

function List({ rows }: { rows: ManifestationRow[] }) {
  return (
    <ul className="rows">
      {rows.map((r) => (
        <li key={r.manifestation.id}>
          <div>
            <div>
              {r.manifestation.status === "live" && <Dot on breathe />}
              <Link href={`/host/${r.manifestation.id}`}>{r.event.title}</Link>
            </div>
            <div className="small muted">
              {r.agentName}, {fmtDay(r.event.startsAt)}
            </div>
          </div>
          <div>{money(r.manifestation.priceCents)}</div>
        </li>
      ))}
    </ul>
  );
}
