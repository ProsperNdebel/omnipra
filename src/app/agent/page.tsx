import Link from "next/link";
import { redirect } from "next/navigation";
import { agentHome, liveAcross, ownerAgents } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { AutoRefresh } from "@/ui/auto-refresh";
import { Bar, Dot } from "@/ui/bar";
import { fmtTime, plural } from "@/ui/format";

export const dynamic = "force-dynamic";

/** All of the viewer's agents, and everywhere they are present right now. */
export default async function Agents() {
  const d = getDeps();
  const agents = await ownerAgents(d, await viewerId());
  if (agents.length === 0) redirect("/agent/new");

  const [live, rows] = await Promise.all([
    liveAcross(d, agents),
    Promise.all(
      agents.map(async (agent) => {
        const sessions = await agentHome(d, agent);
        return {
          agent,
          live: sessions.filter((s) => s.manifestation.status === "live")
            .length,
          total: sessions.length,
        };
      }),
    ),
  ]);
  const places = new Set(live.map((r) => r.event.id)).size;

  return (
    <main className="page">
      <Bar here="agent" />
      {live.length > 0 && <AutoRefresh />}

      <h1 className="title">Your agents</h1>

      {live.length > 0 && (
        <section>
          <h2 className="section">
            <Dot on breathe />
            Live now, {plural(live.length, "session")} in{" "}
            {plural(places, "place")}
          </h2>
          <ol className="schedule">
            {live.map((r) => (
              <li className="slot" key={r.manifestation.id}>
                <time
                  className="time"
                  dateTime={r.manifestation.startedAt ?? undefined}
                >
                  {r.manifestation.startedAt
                    ? fmtTime(r.manifestation.startedAt)
                    : ""}
                </time>
                <div className="what">
                  <Link href={`/m/${r.manifestation.id}`}>{r.event.title}</Link>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {r.latest
                      ? `Latest: ${r.latest.text}`
                      : "Listening, no notes yet."}
                  </div>
                </div>
                <div className="meta">
                  {r.agentName}
                  {r.hostName && ` through ${r.hostName}`}
                  <br />
                  {plural(r.observations, "note")}
                  {r.important > 0 && `, ${r.important} worth acting on`}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="narrow">
        <h2 className="section">Agents</h2>
        <ul className="rows">
          {rows.map(({ agent, live, total }) => (
            <li key={agent.id}>
              <div>
                <div style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>
                  <Dot on={live > 0} breathe={live > 0} />
                  <Link
                    href={`/agent/${agent.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    {agent.name}
                  </Link>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {firstLine(agent.profile)}
                </div>
              </div>
              <div className="small muted" style={{ textAlign: "right" }}>
                {live > 0
                  ? `At ${plural(live, "event")} now`
                  : total > 0
                    ? plural(total, "session")
                    : "No sessions yet"}
              </div>
            </li>
          ))}
        </ul>

        <p style={{ marginTop: 32 }}>
          <Link className="button quiet" href="/agent/new">
            Make another agent
          </Link>
        </p>
      </div>
    </main>
  );
}

/** A short reminder of what each agent is for, from its own profile. */
function firstLine(profile: string): string {
  const line = profile.split("\n")[0]!.trim();
  return line.length > 110 ? `${line.slice(0, 110).trimEnd()}…` : line;
}
