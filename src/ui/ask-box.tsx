"use client";

import { useState } from "react";

/** Ask the agent about anything it experienced, across every event. */
export function AskBox({ agentId, name }: { agentId: string; name: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `${name} couldn't answer. Try again.`);
      setAnswer(body.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 16, gap: 16 }}>
      <label className="field">
        <span className="sr-only" style={{ position: "absolute", left: -9999 }}>
          Question for {name}
        </span>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What did you learn today?"
          maxLength={500}
        />
      </label>
      <button className="button" type="submit" disabled={busy || !question.trim()}>
        {busy ? "Thinking" : "Ask"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {answer && (
        <p className="prose" aria-live="polite">
          {answer}
        </p>
      )}
    </form>
  );
}
