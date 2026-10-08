"use client";

import { useEffect, useRef, useState } from "react";

export interface AskTurnView {
  id: string;
  question: string;
  answer: string;
}

/**
 * Ask the agent about anything it experienced, across every event. One running
 * conversation, saved, so follow ups build on what was already asked.
 */
export function AskBox({
  agentId,
  name,
  initial,
}: {
  agentId: string;
  name: string;
  initial: AskTurnView[];
}) {
  const [turns, setTurns] = useState(initial);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending || turns.length > initial.length)
      end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, pending, initial.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;
    setPending(q);
    setQuestion("");
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.message ?? `${name} couldn't answer. Try again.`);
      setTurns((t) => [...t, body as AskTurnView]);
    } catch (err) {
      setQuestion(q);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  async function startOver() {
    if (pending) return;
    const res = await fetch(`/api/agents/${agentId}/ask`, { method: "DELETE" });
    if (res.ok) setTurns([]);
  }

  return (
    <div className="stack" style={{ marginTop: 16, gap: 16 }}>
      {(turns.length > 0 || pending) && (
        <ol className="talk">
          {turns.map((t) => (
            <Turn
              key={t.id}
              question={t.question}
              answer={t.answer}
              name={name}
            />
          ))}
          {pending && <Turn question={pending} answer={null} name={name} />}
        </ol>
      )}
      <div ref={end} />
      <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
        <label className="field">
          <span
            className="sr-only"
            style={{ position: "absolute", left: -9999 }}
          >
            Question for {name}
          </span>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              turns.length ? "Ask a follow up" : "What did you learn today?"
            }
            maxLength={500}
          />
        </label>
        <p style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button
            className="button"
            type="submit"
            disabled={!!pending || !question.trim()}
          >
            {pending ? "Thinking" : "Ask"}
          </button>
          {turns.length > 0 && (
            <button type="button" className="linkish small" onClick={startOver}>
              Start over
            </button>
          )}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

function Turn({
  question,
  answer,
  name,
}: {
  question: string;
  answer: string | null;
  name: string;
}) {
  return (
    <>
      <li className="talk-chat talk-from-owner">
        <div className="small muted">You</div>
        <div>{question}</div>
      </li>
      <li className="talk-chat talk-from-agent" aria-live="polite">
        <div className="small muted">{name}</div>
        <div className={answer ? undefined : "muted"}>
          {answer ?? "Thinking"}
        </div>
      </li>
    </>
  );
}
