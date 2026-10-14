import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainError } from "@/core";
import { cancelWishAction } from "@/app/wish-actions";
import { askHistory } from "@/pipeline";
import {
  agentActions,
  agentApiKeys,
  agentAttention,
  agentEncounters,
  agentHome,
  agentMemory,
  agentOutings,
  agentSuggestions,
  goalProgress,
  ownedAgent,
  ownerWishes,
} from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { AskBox } from "@/ui/ask-box";
import { Dot, STATUS_WORDS } from "@/ui/bar";
import { fmtDay, fmtTime, money, plural } from "@/ui/format";
import { ApiKeysPanel } from "@/ui/api-keys-panel";
import { EncountersPanel } from "@/ui/encounters-panel";
import { MemoryPanel } from "@/ui/memory-panel";
import { MultiPresence } from "@/ui/multi-presence";
import { OutingsPanel } from "@/ui/outings-panel";
import { ActionsPanel } from "@/ui/actions-panel";
import { SuggestionsPanel } from "@/ui/suggestions-panel";
import { SubmitButton } from "@/ui/submit-button";
import { SavedNotice } from "@/ui/saved-notice";

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
  const me = await viewerId();
  let agent;
  try {
    agent = await ownedAgent(d, me, id);
  } catch (err) {
    if (err instanceof DomainError && err.code === "not_found") notFound();
    throw err;
  }

  const [
    rows,
    turns,
    memory,
    progress,
    suggestions,
    actions,
    attention,
    outings,
    met,
    keys,
    waiting,
  ] = await Promise.all([
    agentHome(d, agent),
    askHistory(d, agent.id),
    agentMemory(d, agent),
    goalProgress(d, agent),
    agentSuggestions(d, agent),
    agentActions(d, agent),
    agentAttention(d, agent),
    agentOutings(d, agent.id),
    agentEncounters(d, agent),
    agentApiKeys(d, agent),
    ownerWishes(d, me),
  ]);
  const live = rows.filter((r) => r.manifestation.status === "live");
  const rest = rows.filter((r) => r.manifestation.status !== "live");
  const hostRequests = waiting.filter(({ wish }) => wish.agentId === agent.id);

  const currentOutings = outings.filter((o) => o.status === "proposed");
  const pastOutings = outings.filter((o) => o.status !== "proposed");
  const needsAttention =
    suggestions.length > 0 ||
    met.some((e) => e.status === "open" && e.myAnswer === "pending") ||
    actions.proposed.length > 0 ||
    actions.todo.length > 0;

  return (
    <main className="page agent-dashboard">
      <p className="small" style={{ marginTop: 40 }}>
        <Link href="/agent">All agents</Link>
      </p>

      <header className="agent-hero">
        <div>
          <h1 className="title" style={{ marginTop: 12 }}>
            <Dot on={live.length > 0} breathe={live.length > 0} />
            {agent.name}
          </h1>
          <p>
            {live.length === 0
              ? "Idle right now."
              : `Present at ${plural(live.length, "event")} right now.`}
          </p>
        </div>
        <Link className="button quiet agent-edit" href={`/agent/${agent.id}/edit`}>
          Edit agent
        </Link>
      </header>

      {saved && <SavedNotice name={agent.name} />}
      {memory.proposed.length > 0 && (
        <p>
          <a href="#memory">
            {plural(memory.proposed.length, "thing")} {agent.name} wants to
            remember
          </a>
        </p>
      )}

      <nav className="agent-jump" aria-label="Agent sections">
        <a href="#now">Now</a>
        <a href="#ask">Ask</a>
        <a href="#attention">Attention{needsAttention ? " ·" : ""}</a>
        <a href="#memory">Memory</a>
        <a href="#history">History</a>
      </nav>

      <section id="now" className="agent-section">
        <div className="narrow">
          <h2 className="section">Right now</h2>
        </div>

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

        {live.length === 0 && hostRequests.length === 0 && currentOutings.length === 0 && (
          <p className="muted narrow">
            Nothing active right now. You can ask {agent.name} to find somewhere
            useful to be.
          </p>
        )}

        {hostRequests.length > 0 && (
          <div className="narrow">
            <h3 className="group">Waiting for a host</h3>
            <ul className="rows">
              {hostRequests.map(({ wish, event }) => (
                <li key={wish.id}>
                  <div>
                    <div>
                      <Link href={`/events/${event.id}`}>{event.title}</Link>
                    </div>
                    <div className="small muted">
                      {fmtDay(event.startsAt)}, up to {money(wish.maxPriceCents)}
                    </div>
                  </div>
                  <form action={cancelWishAction}>
                    <input type="hidden" name="id" value={wish.id} />
                    <input type="hidden" name="back" value={`/agent/${agent.id}`} />
                    <SubmitButton quiet pending="Withdrawing">
                      Withdraw request
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <OutingsPanel
          agentId={agent.id}
          name={agent.name}
          outings={currentOutings}
          heading="Plans and outings"
          subsection
          showScout
        />
      </section>

      <section id="ask" className="agent-section">
        <div className="narrow">
          <h2 className="section">Talk to {agent.name}</h2>
          <p className="muted small">
            Ask about what it heard at events or what it knows about you.
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
      </section>

      <section id="attention" className="agent-section">
        <div className="narrow">
          <h2 className="section">What needs your attention</h2>
          {!needsAttention && (
            <p className="muted small">Nothing needs a decision right now.</p>
          )}
        </div>
        <SuggestionsPanel agentId={agent.id} open={suggestions} />
        <ActionsPanel agentId={agent.id} name={agent.name} {...actions} />
        <EncountersPanel agentId={agent.id} name={agent.name} met={met} />
      </section>

      <section className="agent-section">
        <MemoryPanel
          agent={agent}
          memory={memory}
          progress={progress}
          error={error}
        />
      </section>

      <section id="history" className="agent-section">
        <div className="narrow">
          <h2 className="section">History</h2>
        </div>

        {pastOutings.length > 0 && (
          <OutingsPanel
            agentId={agent.id}
            name={agent.name}
            outings={pastOutings}
            heading="Previous outing plans"
            subsection
            showScout={false}
          />
        )}

        <div className="narrow">
          <h3 className="group">Previous sessions</h3>
          {rest.length === 0 && live.length === 0 ? (
            <p className="muted">
              {agent.name} hasn&rsquo;t been anywhere yet.{" "}
              <Link href="/">Find an event</Link>.
            </p>
          ) : rest.length === 0 ? (
            <p className="muted small">No previous sessions yet.</p>
          ) : (
            <Sessions rows={rest} />
          )}
        </div>
      </section>

      <section className="agent-section narrow">
        <details className="advanced">
          <summary>Advanced</summary>
          <ApiKeysPanel
            agentId={agent.id}
            name={agent.name}
            keys={keys.map((k) => ({
              id: k.id,
              label: k.label,
              prefix: k.prefix,
              createdAt: k.createdAt,
              lastUsedAt: k.lastUsedAt,
            }))}
          />
        </details>
      </section>
    </main>
  );}

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
