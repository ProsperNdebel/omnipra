import Link from "next/link";
import { notFound } from "next/navigation";
import { askHistory } from "@/pipeline";
import {
  agentActions,
  agentAttention,
  agentHome,
  agentMemory,
  agentSuggestions,
  goalProgress,
  ownedAgent,
} from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { AskBox } from "@/ui/ask-box";
import { Dot, STATUS_WORDS } from "@/ui/bar";
import { fmtDay, fmtTime, plural } from "@/ui/format";
import { MemoryPanel } from "@/ui/memory-panel";
import { MultiPresence } from "@/ui/multi-presence";
import { ActionsPanel } from "@/ui/actions-panel";
import { SuggestionsPanel } from "@/ui/suggestions-panel";

export const dynamic = "force-dynamic";

/** One agent: where it is now, what it remembers, and every session it has had. */
export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);
  const d = getDeps();
  const agent = await ownedAgent(d, await viewerId(), id).catch(() =>
    notFound(),
  );

  const [rows, turns, memory, progress, suggestions, actions, attention] =
    await Promise.all([
      agentHome(d, agent),
      askHistory(d, agent.id),
      agentMemory(d, agent),
      goalProgress(d, agent),
      agentSuggestions(d, agent),
      agentActions(d, agent),
      agentAttention(d, agent),
    ]);
  const live = rows.filter((r) => r.manifestation.status === "live");
  const rest = rows.filter((r) => r.manifestation.status !== "live");

  return (
    <main className="page">
      <p className="small" style={{ marginTop: 40 }}>
        <Link href="/agent">All agents</Link>
      </p>
      <h1 className="title" style={{ marginTop: 12 }}>
        <Dot on={live.length > 0} breathe={live.length > 0} />
        {agent.name}
      </h1>
      <p>
        {live.length === 0
          ? "Not at any event right now."
          : `Present at ${plural(live.length, "event")} right now.`}
      </p>
      {saved && <p>Saved. {agent.name} uses this from its next note.</p>}
      {memory.proposed.length > 0 && (
        <p>
          <a href="#memory">
            {plural(memory.proposed.length, "thing")} {agent.name} wants to
            remember
          </a>
        </p>
      )}

      <SuggestionsPanel agentId={agent.id} open={suggestions} />
      <ActionsPanel agentId={agent.id} name={agent.name} {...actions} />

      {live.length > 1 ? (
        <MultiPresence
          name={agent.name}
          attention={attention}
          rooms={live.map((r) => ({
            id: r.manifestation.id,
            eventTitle: r.event.title,
            hostName: r.hostName,
            observations: r.observations,
          }))}
        />
      ) : (
        live.length > 0 && <Sessions rows={live} />
      )}

      <div className="narrow">
        <h2 className="section">Ask {agent.name}</h2>
        <p className="muted small">
          Answers come from what {agent.name} heard at events and what it knows
          about you below.
        </p>
        <AskBox
          agentId={agent.id}
          name={agent.name}
          initial={turns.map(({ id, question, answer }) => ({
            id,
            question,
            answer,
          }))}
        />
      </div>

      <MemoryPanel
        agent={agent}
        memory={memory}
        progress={progress}
        error={error}
      />

      <h2 className="section">Sessions</h2>
      {rest.length === 0 && live.length === 0 ? (
        <p className="muted">
          {agent.name} hasn&rsquo;t been anywhere yet.{" "}
          <Link href="/">Find an event</Link>.
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
