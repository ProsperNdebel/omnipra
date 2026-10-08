import Link from "next/link";
import { decideActionAction, editActionAction } from "@/app/actions";
import { describeAction, type ActionPayload } from "@/core";
import type { ActionView, SuggestionSource } from "@/services";
import { clock, fmtDay, isoToLocalInput } from "./format";
import { RunButton } from "./run-button";
import { SubmitButton } from "./submit-button";

/**
 * The action layer on the agent page: what it has prepared for approval, the to dos
 * it is tracking, and the record of what got done. Nothing leaves without the owner
 * pressing a button.
 */
export function ActionsPanel({
  agentId,
  name,
  proposed,
  todo,
  done,
}: {
  agentId: string;
  name: string;
  proposed: ActionView[];
  todo: ActionView[];
  done: ActionView[];
}) {
  if (!proposed.length && !todo.length && !done.length) return null;
  return (
    <section id="actions" className="narrow">
      {proposed.length > 0 && (
        <>
          <h2 className="section">Ready for you</h2>
          <ul className="rows">
            {proposed.map((a) => (
              <li className="proposal" key={a.id}>
                <div className="full">
                  <div className="small muted">
                    {describeAction(a.payload).split(":")[0]} prepared by {name}
                  </div>
                  <Preview p={a.payload} />
                  {a.why && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      {a.why}
                    </div>
                  )}
                  <Sources sources={a.sources} />
                  <div className="actions" style={{ marginTop: 12 }}>
                    {a.payload.kind === "task" ? (
                      <Decide
                        a={a}
                        agentId={agentId}
                        op="approve"
                        pending="Adding"
                      >
                        Add to my to do list
                      </Decide>
                    ) : (
                      a.executors.map((e, i) => (
                        <RunButton
                          key={e.id}
                          actionId={a.id}
                          executorId={e.id}
                          label={e.label}
                          quiet={i > 0}
                        />
                      ))
                    )}
                    <Decide
                      a={a}
                      agentId={agentId}
                      op="dismiss"
                      pending="Dismissing"
                      quiet
                    >
                      Not this
                    </Decide>
                  </div>
                  <Edit a={a} agentId={agentId} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {todo.length > 0 && (
        <>
          <h3 className="group">To do</h3>
          <ul className="rows">
            {todo.map((a) => (
              <li key={a.id}>
                <div className="full">
                  <div>
                    {a.payload.kind === "task"
                      ? a.payload.text
                      : describeAction(a.payload)}
                  </div>
                  {a.payload.kind === "task" && a.payload.due && (
                    <div className="small muted">
                      Due {fmtDay(a.payload.due)}
                    </div>
                  )}
                  <Sources sources={a.sources} />
                  <div style={{ marginTop: 8 }}>
                    <Decide
                      a={a}
                      agentId={agentId}
                      op="complete"
                      pending="Saving"
                      quiet
                    >
                      Done
                    </Decide>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {done.length > 0 && (
        <>
          <h3 className="group">Done for you</h3>
          <ul className="rows">
            {done.map((a) => (
              <li key={a.id}>
                <div className="full">
                  <div>{describeAction(a.payload)}</div>
                  <div className="small muted">
                    {a.how}
                    {a.doneAt && `, ${fmtDay(a.doneAt)}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The action as it will go out. */
function Preview({ p }: { p: ActionPayload }) {
  const strong = { marginTop: 4, fontWeight: 600 } as const;
  switch (p.kind) {
    case "email":
      return (
        <>
          <div style={strong}>{p.subject}</div>
          <div className="small muted">
            To: {p.to || "add an address when it opens"}
          </div>
          <p className="prose" style={{ marginTop: 8 }}>
            {p.body}
          </p>
        </>
      );
    case "event":
      return (
        <>
          <div style={strong}>{p.title}</div>
          <div className="small muted">
            {p.start
              ? fmtDay(p.start)
              : "No time yet, set one below or in your calendar"}
            , {p.durationMin} min
          </div>
          {p.details && (
            <p className="prose" style={{ marginTop: 8 }}>
              {p.details}
            </p>
          )}
        </>
      );
    case "contact":
      return (
        <>
          <div style={strong}>{p.name}</div>
          <div className="small muted">
            {[p.role, p.company, p.email].filter(Boolean).join(", ")}
          </div>
          {p.notes && (
            <p className="prose" style={{ marginTop: 8 }}>
              {p.notes}
            </p>
          )}
        </>
      );
    case "task":
      return <div style={strong}>{p.text}</div>;
    case "note":
      return (
        <>
          <div style={strong}>{p.title}</div>
          <p className="prose" style={{ marginTop: 8 }}>
            {p.body}
          </p>
        </>
      );
  }
}

/** Every field the owner can correct, per kind. */
const FIELDS: Record<
  ActionPayload["kind"],
  [string, string, "text" | "long" | "time" | "number"][]
> = {
  email: [
    ["to", "To", "text"],
    ["subject", "Subject", "text"],
    ["body", "Message", "long"],
  ],
  event: [
    ["title", "Title", "text"],
    ["start", "When", "time"],
    ["durationMin", "Minutes", "number"],
    ["details", "Details", "long"],
  ],
  contact: [
    ["name", "Name", "text"],
    ["company", "Company", "text"],
    ["role", "Role", "text"],
    ["email", "Email", "text"],
    ["notes", "Notes", "long"],
  ],
  task: [
    ["text", "To do", "text"],
    ["due", "Due", "time"],
  ],
  note: [
    ["title", "Title", "text"],
    ["body", "Note", "long"],
  ],
};

function Edit({ a, agentId }: { a: ActionView; agentId: string }) {
  const values = a.payload as unknown as Record<string, string | number | null>;
  return (
    <details className="change">
      <summary className="linkish small">Edit first</summary>
      <form
        action={editActionAction}
        className="stack"
        style={{ marginTop: 12 }}
      >
        <input type="hidden" name="agentId" value={agentId} />
        <input type="hidden" name="id" value={a.id} />
        {FIELDS[a.payload.kind].map(([key, label, type]) => (
          <label className="field" key={key}>
            <span className="small muted">{label}</span>
            {type === "long" ? (
              <textarea
                name={`f:${key}`}
                defaultValue={String(values[key] ?? "")}
              />
            ) : (
              <input
                type={
                  type === "time"
                    ? "datetime-local"
                    : type === "number"
                      ? "number"
                      : "text"
                }
                name={`f:${key}`}
                defaultValue={
                  type === "time"
                    ? isoToLocalInput(values[key] as string | null)
                    : String(values[key] ?? "")
                }
              />
            )}
          </label>
        ))}
        <div className="actions">
          <SubmitButton pending="Saving">Save</SubmitButton>
        </div>
      </form>
    </details>
  );
}

function Decide({
  a,
  agentId,
  op,
  pending,
  quiet,
  children,
}: {
  a: ActionView;
  agentId: string;
  op: "approve" | "complete" | "dismiss";
  pending: string;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={decideActionAction}>
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton pending={pending} quiet={quiet}>
        {children}
      </SubmitButton>
    </form>
  );
}

export function Sources({ sources }: { sources: SuggestionSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="small muted" style={{ marginTop: 6 }}>
      Based on{" "}
      {sources.map((src, i) => (
        <span key={src.noteId}>
          {i > 0 && ", "}
          <Link href={`/m/${src.sessionId}#note-${src.noteId}`}>
            {src.eventTitle}
            {src.atSec !== null &&
              ` ${clock(src.atSec).replace(/^0(?=\d:)/, "")}`}
          </Link>
        </span>
      ))}
    </div>
  );
}
