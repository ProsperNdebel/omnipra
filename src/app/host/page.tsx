import Link from "next/link";
import { sensorsInWords } from "@/core";
import { decideAction, unblockAction } from "@/app/actions";
import {
  hostBlocks,
  hostDevices,
  hostInbox,
  type ManifestationRow,
} from "@/services";
import { DevicesPanel } from "@/ui/devices-panel";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { Dot } from "@/ui/bar";
import { fmtDay, fmtRange, money } from "@/ui/format";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function HostInbox({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await viewerId();
  const [rows, devices, blocked] = await Promise.all([
    hostInbox(getDeps(), me),
    hostDevices(getDeps(), me),
    hostBlocks(getDeps(), me),
  ]);
  const requests = rows.filter((r) => r.manifestation.status === "requested");
  const upcoming = rows.filter((r) =>
    ["accepted", "live"].includes(r.manifestation.status),
  );
  const past = rows.filter((r) =>
    ["ended", "briefed"].includes(r.manifestation.status),
  );

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Hosting</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {rows.length === 0 && (
          <p>
            No requests yet. Say you&rsquo;re attending an event on its page and
            requests will show up here. <Link href="/">Find an event</Link>.
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
                      {fmtDay(r.event.startsAt)},{" "}
                      {fmtRange(r.event.startsAt, r.event.endsAt)}
                    </div>
                  </div>
                  <div>{money(r.manifestation.priceCents)}</div>
                  <div className="full">
                    <p className="small">
                      {r.agentName} will use {sensorsInWords(r.requires)}.
                      Nothing else on your phone. It writes notes for its owner;
                      you&rsquo;ll see how much it has captured, not what.
                    </p>
                    {/* One form per decision: the clicked button's value isn't reliably sent to server actions. */}
                    <div className="actions" style={{ marginTop: 14 }}>
                      <form action={decideAction}>
                        <input
                          type="hidden"
                          name="id"
                          value={r.manifestation.id}
                        />
                        <input type="hidden" name="decision" value="accept" />
                        <SubmitButton pending="Accepting">
                          Accept {money(r.manifestation.priceCents)}
                        </SubmitButton>
                      </form>
                      <form action={decideAction}>
                        <input
                          type="hidden"
                          name="id"
                          value={r.manifestation.id}
                        />
                        <input type="hidden" name="decision" value="decline" />
                        <SubmitButton pending="Declining" quiet>
                          Decline
                        </SubmitButton>
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
        <DevicesPanel
          devices={devices.map((d) => ({
            id: d.id,
            name: d.name,
            kind: d.kind,
            capabilities: d.capabilities,
            lastSeenAt: d.lastSeenAt,
          }))}
        />

        {blocked.length > 0 && (
          <>
            <h2 className="section">Blocked</h2>
            <ul className="rows">
              {blocked.map((b) => (
                <li key={b.ownerId}>
                  <div>
                    The owner of {b.agents.join(", ") || "a deleted agent"}
                    <div className="small muted">
                      Can&rsquo;t send you requests.
                    </div>
                  </div>
                  <form action={unblockAction}>
                    <input type="hidden" name="ownerId" value={b.ownerId} />
                    <SubmitButton pending="Unblocking" quiet>
                      Unblock
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="small muted" style={{ marginTop: 40 }}>
          <Link href="/activity">Activity</Link>: every session, device and
          block on your account.
        </p>
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
