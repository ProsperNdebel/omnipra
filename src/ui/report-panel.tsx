"use client";

import { useState } from "react";

/**
 * Flag a session for review. Hosts can also block the owner, so they never get a
 * request from them again.
 */
export function ReportPanel({
  sessionId,
  asHost,
}: {
  sessionId: string;
  asHost: boolean;
}) {
  const [reason, setReason] = useState("");
  const [block, setBlock] = useState(asHost);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    const res = await fetch(`/api/manifestations/${sessionId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, block: asHost && block }),
    }).catch(() => null);
    if (res?.ok) return setState("sent");
    setError(
      (await res?.json().catch(() => null))?.message ??
        "That didn't go through. Try again.",
    );
    setState("error");
  }

  if (state === "sent")
    return (
      <p className="small muted">
        Reported{asHost && block ? ", and they can’t book you again" : ""}.
        We&rsquo;ll look at it.
      </p>
    );

  return (
    <details className="change small">
      <summary>{asHost ? "Report or block" : "Report a problem"}</summary>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          placeholder="What happened?"
          aria-label="What happened"
          style={{ minHeight: "5rem" }}
        />
        {asHost && (
          <label style={{ display: "flex", gap: 10 }}>
            <input
              type="checkbox"
              checked={block}
              onChange={(e) => setBlock(e.target.checked)}
            />
            <span>Block this owner from booking me again</span>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div>
          <button
            className="button quiet"
            onClick={send}
            disabled={state === "sending" || reason.trim().length < 5}
          >
            {state === "sending" ? "Sending" : "Send report"}
          </button>
        </div>
      </div>
    </details>
  );
}
