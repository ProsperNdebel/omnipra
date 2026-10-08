import Link from "next/link";
import { redirect } from "next/navigation";
import { agentHome, ownerAgents } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { Bar, Dot } from "@/ui/bar";
import { plural } from "@/ui/format";

export const dynamic = "force-dynamic";

/** All of the viewer's agents, with where each one is right now. */
export default async function Agents() {
  const d = getDeps();
  const agents = await ownerAgents(d, await viewerId());
  if (agents.length === 0) redirect("/agent/new");

  const rows = await Promise.all(
    agents.map(async (agent) => {
      const sessions = await agentHome(d, agent);
      return {
        agent,
        live: sessions.filter((s) => s.manifestation.status === "live").length,
        total: sessions.length,
      };
    }),
  );

  return (
    <main className="page">
      <Bar here="agent" />
      <div className="narrow">
        <h1 className="title">Your agents</h1>

        <ul className="rows" style={{ marginTop: 32 }}>
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
