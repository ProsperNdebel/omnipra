import Link from "next/link";
import { addMemoryAction, reviewMemoryAction } from "@/app/actions";
import type { Agent, MemoryKind } from "@/core";
import type { AgentMemoryView, GoalProgress, MemoryView } from "@/services";
import { plural } from "./format";
import { SubmitButton } from "./submit-button";

const KIND_WORDS: Record<MemoryKind, string> = {
  identity: "About itself",
  owner: "About you",
  goal: "Goal",
  experience: "From an event",
};

/**
 * Everything the agent knows, laid out by how far it is trusted, so the owner can
 * see what it reasons with and correct it. Server rendered; every change is a form.
 */
export function MemoryPanel({
  agent,
  memory,
  progress,
  error,
}: {
  agent: Agent;
  memory: AgentMemoryView;
  progress: Record<string, GoalProgress>;
  error?: string;
}) {
  const { proposed, active } = memory;
  const name = agent.name;
  return (
    <section id="memory" className="narrow">
      <h2 className="section">What {name} knows</h2>
      <p className="muted small">
        {name} reasons with all of this at every event and when you ask it
        something. What it picks up on its own waits here until you keep it.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {proposed.length > 0 && (
        <>
          <h3 className="group">{name} wants to remember</h3>
          <ul className="rows">
            {proposed.map((m) => (
              <li className="proposal" key={m.id}>
                <div className="full">
                  <div className="small muted">
                    {KIND_WORDS[m.kind]}, <Source m={m} />
                  </div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>{m.text}</div>
                  <div className="actions" style={{ marginTop: 12 }}>
                    <Review m={m} op="keep" pending="Keeping">
                      Keep
                    </Review>
                    <Review m={m} op="forget" pending="Forgetting" quiet>
                      Forget
                    </Review>
                  </div>
                  <Correct m={m} label="Correct it first" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Group
        agent={agent}
        kind="goal"
        title="Working on for you"
        items={active.goal}
        empty={`No goals yet. Give ${name} something to work toward across events.`}
        placeholder="Find banks that need Shona speech recognition"
        extra={(m) => <Progress p={progress[m.id]} />}
      />

      <Group
        agent={agent}
        kind="owner"
        title="About you"
        items={active.owner}
        placeholder="I'm raising a seed round early next year"
        intro={
          <>
            <p className="prose muted">{agent.profile}</p>
            <p className="small">
              <Link href={`/agent/${agent.id}/edit`}>Edit your brief</Link>
            </p>
          </>
        }
      />

      <Group
        agent={agent}
        kind="identity"
        title={`Who ${name} is`}
        items={active.identity}
        placeholder="Lead with the number. Skip the pleasantries."
        intro={
          <p className="prose muted">
            {agent.style.trim() || "Default voice: short and direct."}{" "}
            <Link className="small" href={`/agent/${agent.id}/edit`}>
              Change
            </Link>
          </p>
        }
      />

      <Group
        agent={agent}
        kind="experience"
        title="From events"
        items={active.experience}
        empty={`Nothing yet. After each event, ${name} suggests what's worth keeping. These are what people said, not verified facts.`}
      />
    </section>
  );
}

function Group({
  agent,
  kind,
  title,
  items,
  intro,
  empty,
  placeholder,
  extra,
}: {
  agent: Agent;
  kind: MemoryKind;
  title: string;
  items: MemoryView[];
  intro?: React.ReactNode;
  empty?: string;
  /** More to say about each item, like progress on a goal. */
  extra?: (m: MemoryView) => React.ReactNode;
  /** Set when the owner can add to this group directly. */
  placeholder?: string;
}) {
  return (
    <>
      <h3 className="group">{title}</h3>
      {intro}
      {items.length === 0 && empty && !intro && (
        <p className="muted small">{empty}</p>
      )}
      {items.length > 0 && (
        <ul className="rows">
          {items.map((m) => (
            <li key={m.id}>
              <div className="full">
                <div>{m.text}</div>
                {extra?.(m)}
                <div className="small muted" style={{ marginTop: 2 }}>
                  <Source m={m} />
                </div>
                <Correct m={m} label="Change" forget />
              </div>
            </li>
          ))}
        </ul>
      )}
      {placeholder && (
        <form action={addMemoryAction} className="memory-add">
          <input type="hidden" name="agentId" value={agent.id} />
          <input type="hidden" name="kind" value={kind} />
          <input
            type="text"
            name="text"
            required
            maxLength={400}
            placeholder={placeholder}
            aria-label={`Add to ${title}`}
          />
          <SubmitButton pending="Adding" quiet>
            Add
          </SubmitButton>
        </form>
      )}
    </>
  );
}

/** Where a memory came from: the line that tells said apart from heard. */
function Source({ m }: { m: MemoryView }) {
  const s = m.source;
  if (s.type === "owner") return <>you added this</>;
  if (s.type === "said") {
    const quote = s.quote.length > 90 ? `${s.quote.slice(0, 90)}...` : s.quote;
    return (
      <>
        from what you said: &ldquo;{quote}&rdquo;
        {m.from && (
          <>
            {" "}
            at <Link href={`/m/${m.from.sessionId}`}>{m.from.eventTitle}</Link>
          </>
        )}
      </>
    );
  }
  return (
    <>
      heard at{" "}
      {m.from ? (
        <Link href={`/m/${m.from.sessionId}#note-${s.observationIds[0]}`}>
          {m.from.eventTitle}
        </Link>
      ) : (
        "an event"
      )}
      , not verified
    </>
  );
}

function Review({
  m,
  op,
  pending,
  quiet,
  children,
}: {
  m: MemoryView;
  op: "keep" | "forget";
  pending: string;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={reviewMemoryAction}>
      <input type="hidden" name="agentId" value={m.agentId} />
      <input type="hidden" name="id" value={m.id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton pending={pending} quiet={quiet}>
        {children}
      </SubmitButton>
    </form>
  );
}

/** Correct the wording in place. No script: a disclosure holding a form. */
function Correct({
  m,
  label,
  forget,
}: {
  m: MemoryView;
  label: string;
  forget?: boolean;
}) {
  return (
    <details className="change">
      <summary className="linkish small">{label}</summary>
      <form action={reviewMemoryAction} className="memory-add">
        <input type="hidden" name="agentId" value={m.agentId} />
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="op" value="edit" />
        <input
          type="text"
          name="text"
          required
          maxLength={400}
          defaultValue={m.text}
          aria-label="Correct this memory"
        />
        <SubmitButton pending="Saving" quiet>
          Save
        </SubmitButton>
      </form>
      {forget && (
        <form action={reviewMemoryAction} style={{ marginTop: 8 }}>
          <input type="hidden" name="agentId" value={m.agentId} />
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="op" value="forget" />
          <button type="submit" className="linkish small">
            Forget this
          </button>
        </form>
      )}
    </details>
  );
}

/** How far a goal has come across events, from notes tagged to plan items that serve it. */
function Progress({ p }: { p: GoalProgress | undefined }) {
  if (!p || (p.notes === 0 && p.watchingNow === 0)) {
    return (
      <div className="small muted" style={{ marginTop: 2 }}>
        Nothing toward this yet.
      </div>
    );
  }
  const parts = [
    p.notes > 0 &&
      `${plural(p.notes, "note")} from ${plural(p.events, "event")}`,
    p.watchingNow > 0 &&
      `watching for it at ${plural(p.watchingNow, "event")} now`,
  ].filter(Boolean);
  return (
    <div className="small" style={{ marginTop: 2 }}>
      {parts.join(", ")}
    </div>
  );
}
