import Link from "next/link";
import { redirect } from "next/navigation";
import { agentHome, ownerAgent } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { AskBox } from "@/ui/ask-box";
import { Bar, Dot, STATUS_WORDS } from "@/ui/bar";
import { fmtDay, fmtTime, plural } from "@/ui/format";

export const dynamic = "force-dynamic";

export default async function AgentHome() {
  const d = getDeps();
  const agent = await ownerAgent(d, await viewerId());
  if (!agent) redirect("/agent/new");

  const rows = await agentHome(d, agent);
  const live = rows.filter((r) => r.manifestation.status === "live");
  const rest = rows.filter((r) => r.manifestation.status !== "live");

  return (
    <main className="page">
      <Bar here="agent" />

      <h1 className="title">
        <Dot on={live.length > 0} breathe={live.length > 0} />
        {agent.name}
      </h1>
      <p>
        {live.length === 0
          ? "Not at any event right now."
          : `Present at ${plural(live.length, "event")} right now.`}
      </p>

      {live.length > 0 && <Sessions rows={live} />}

      <div className="narrow">
        <h2 className="section">Ask {agent.name}</h2>
        <p className="muted small">Answers come only from what {agent.name} heard at events.</p>
        <AskBox agentId={agent.id} name={agent.name} />
      </div>

      <h2 className="section">Sessions</h2>
      {rest.length === 0 && live.length === 0 ? (
        <p className="muted">
          {agent.name} hasn&rsquo;t been anywhere yet. <Link href="/">Find an event</Link>.
        </p>
      ) : (
        <Sessions rows={rest} />
      )}
    </main>
  );
}

function Sessions({ rows }: { rows: Awaited<ReturnType<typeof agentHome>> }) {
  return (
    <ol className="schedule">
      {rows.map((r) => (
        <li className="slot" key={r.manifestation.id}>
          <time className="time" dateTime={r.event.startsAt}>
            {fmtTime(r.event.startsAt)}
          </time>
          <div className="what">
            <Link href={`/m/${r.manifestation.id}`}>{r.event.title}</Link>
          </div>
          <div className="meta">
            {r.manifestation.status === "live" && <Dot on breathe />}
            {STATUS_WORDS[r.manifestation.status]}
            {r.observations > 0 && `, ${plural(r.observations, "observation")}`}
            <br />
            {fmtDay(r.event.startsAt)}
            {r.hostName && `, through ${r.hostName}`}
          </div>
        </li>
      ))}
    </ol>
  );
}
