"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentMessage, Autonomy, HostRequest } from "@/core";
import { clock } from "./format";

/**
 * The owner's side of a live session: what the agent is saying, what it wants to do,
 * and a way to talk back. This is the part that makes it presence, not a recording.
 */
export function PresencePanel({
  id,
  agentName,
  hostName,
  active,
  messages,
  requests,
  autonomy,
  hostTakesRequests,
  onChange,
}: {
  id: string;
  agentName: string;
  hostName: string;
  /** Accepted or live: the agent can still be talked to and act. */
  active: boolean;
  messages: AgentMessage[];
  requests: HostRequest[];
  autonomy: Autonomy;
  hostTakesRequests: boolean;
  /** Ask the parent to refetch after anything changes. */
  onChange: () => Promise<void>;
}) {
  useAlerts(agentName, messages, requests);
  const proposed = requests.filter((r) => r.status === "proposed");
  const withHost = requests.filter(
    (r) =>
      r.status === "sent" || r.status === "done" || r.status === "declined",
  );
  if (!active && messages.length === 0) return null;

  return (
    <section className="narrow">
      <h2 className="section">With {agentName}</h2>

      {proposed.length > 0 && (
        <ul className="rows">
          {proposed.map((r) => (
            <Proposal
              key={r.id}
              sessionId={id}
              r={r}
              hostName={hostName}
              onDone={onChange}
            />
          ))}
        </ul>
      )}

      <Conversation
        messages={messages}
        agentName={agentName}
        hostName={hostName}
      />

      {active && (
        <Talk sessionId={id} agentName={agentName} onSent={onChange} />
      )}

      {withHost.length > 0 && (
        <>
          <h2 className="section">Asked through {hostName}</h2>
          <ul className="rows">
            {withHost.map((r) => (
              <li key={r.id}>
                <div className="full">
                  <div className="small muted">{REQUEST_WORDS[r.status]}</div>
                  <div style={{ marginTop: 4 }}>{r.ask}</div>
                  {r.hostNote && (
                    <div className="small" style={{ marginTop: 4 }}>
                      {hostName}: &ldquo;{r.hostNote}&rdquo;
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {active && hostTakesRequests && (
        <AutonomyToggle
          sessionId={id}
          agentName={agentName}
          hostName={hostName}
          autonomy={autonomy}
          onChange={onChange}
        />
      )}
      {active && !hostTakesRequests && (
        <p className="small muted" style={{ marginTop: 24 }}>
          {hostName} isn&rsquo;t taking requests, so {agentName} can listen and
          talk to you but can&rsquo;t ask anything in the room.
        </p>
      )}
    </section>
  );
}

const REQUEST_WORDS: Record<HostRequest["status"], string> = {
  proposed: "Waiting for you",
  dismissed: "Dropped",
  sent: "With the host now",
  done: "Done",
  declined: "Couldn't do it",
};

function Conversation({
  messages,
  agentName,
  hostName,
}: {
  messages: AgentMessage[];
  agentName: string;
  hostName: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="muted" style={{ marginTop: 12 }}>
        {agentName} will tell you here when something matters, and you can tell
        it what to focus on.
      </p>
    );
  }
  const who = (m: AgentMessage) =>
    m.from === "agent" ? agentName : m.from === "host" ? hostName : "You";
  return (
    <ol className="talk" aria-live="polite">
      {messages.map((m) => (
        <li key={m.id} className={`talk-${m.kind} talk-from-${m.from}`}>
          <div className="small muted">
            {who(m)}
            {m.kind === "nudge" && ", flagged"}
            {m.atSec !== null &&
              `, ${clock(m.atSec).replace(/^0(?=\d:)/, "")} in`}
          </div>
          <div>{m.text}</div>
        </li>
      ))}
    </ol>
  );
}

function Talk({
  sessionId,
  agentName,
  onSent,
}: {
  sessionId: string;
  agentName: string;
  onSent: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/manifestations/${sessionId}/talk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (res?.ok) {
      setText("");
      await onSent();
    } else {
      setError(
        (await res?.json().catch(() => null))?.message ??
          `Couldn't reach ${agentName}. Try again.`,
      );
    }
    setBusy(false);
  }

  return (
    <form onSubmit={send} style={{ marginTop: 20, display: "grid", gap: 12 }}>
      <label className="field">
        <span className="small muted">Tell {agentName}</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Focus on pricing now, or: ask whether they're hiring"
        />
      </label>
      <div className="actions">
        <button
          className="button"
          type="submit"
          disabled={busy || !text.trim()}
        >
          {busy ? `${agentName} is thinking` : "Send"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Something the agent wants to ask in the room. The owner sends it, edits it, or drops it. */
function Proposal({
  sessionId,
  r,
  hostName,
  onDone,
}: {
  sessionId: string;
  r: HostRequest;
  hostName: string;
  onDone: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState(r.ask);
  const [busy, setBusy] = useState<"send" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(event: "send" | "dismiss") {
    setBusy(event);
    setError(null);
    const res = await fetch(
      `/api/manifestations/${sessionId}/requests/${r.id}/${event}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event === "send" ? { ask } : {}),
      },
    ).catch(() => null);
    if (res?.ok) await onDone();
    else
      setError(
        (await res?.json().catch(() => null))?.message ??
          "That didn't go through. Try again.",
      );
    setBusy(null);
  }

  return (
    <li className="proposal">
      <div className="full">
        <div className="small muted">Wants to ask {hostName}</div>
        {editing ? (
          <textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            style={{ minHeight: "4.5rem", marginTop: 6 }}
            aria-label="Edit the ask"
          />
        ) : (
          <div style={{ marginTop: 4, fontWeight: 600 }}>{ask}</div>
        )}
        {r.why && (
          <div className="small muted" style={{ marginTop: 4 }}>
            Why: {r.why}
          </div>
        )}
        <div className="actions" style={{ marginTop: 12 }}>
          <button
            className="button"
            onClick={() => act("send")}
            disabled={!!busy || !ask.trim()}
          >
            {busy === "send" ? "Sending" : `Send to ${hostName}`}
          </button>
          {!editing && (
            <button
              className="button quiet"
              onClick={() => setEditing(true)}
              disabled={!!busy}
            >
              Edit
            </button>
          )}
          <button
            className="button quiet"
            onClick={() => act("dismiss")}
            disabled={!!busy}
          >
            {busy === "dismiss" ? "Dropping" : "Drop"}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

function AutonomyToggle({
  sessionId,
  agentName,
  hostName,
  autonomy,
  onChange,
}: {
  sessionId: string;
  agentName: string;
  hostName: string;
  autonomy: Autonomy;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function toggle(next: Autonomy) {
    setBusy(true);
    await fetch(`/api/manifestations/${sessionId}/autonomy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autonomy: next }),
    }).catch(() => null);
    await onChange();
    setBusy(false);
  }
  return (
    <label
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        marginTop: 28,
      }}
    >
      <input
        type="checkbox"
        checked={autonomy === "act"}
        disabled={busy}
        onChange={(e) => toggle(e.target.checked ? "act" : "ask_first")}
        style={{ marginTop: 4, flex: "none" }}
      />
      <span>
        Let {agentName} ask {hostName} directly, without checking with me
        <span className="small muted" style={{ display: "block" }}>
          {autonomy === "act"
            ? `${agentName} sends its asks straight to ${hostName}. You'll see each one here.`
            : `${agentName} proposes asks and waits for you.`}
        </span>
      </span>
    </label>
  );
}

/**
 * Browser notifications for nudges and proposals that arrive after the page loaded,
 * so the owner hears about them while doing something else. Also marks the tab title.
 */
function useAlerts(
  agentName: string,
  messages: AgentMessage[],
  requests: HostRequest[],
) {
  const seen = useRef<Set<string> | null>(null);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  useEffect(() => {
    if (typeof Notification !== "undefined")
      setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    const items = [
      ...messages
        .filter((m) => m.kind === "nudge" && m.from === "agent")
        .map((m) => ({ id: m.id, body: m.text })),
      ...requests
        .filter((r) => r.status === "proposed")
        .map((r) => ({ id: r.id, body: `Wants to ask: ${r.ask}` })),
    ];
    // First render: everything already here counts as seen.
    if (!seen.current) {
      seen.current = new Set(items.map((i) => i.id));
      return;
    }
    const fresh = items.filter((i) => !seen.current!.has(i.id));
    for (const i of fresh) seen.current.add(i.id);
    if (fresh.length === 0) return;

    if (document.visibilityState === "hidden") {
      document.title = `(${fresh.length}) ${agentName}, Presence`;
    }
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      for (const i of fresh)
        new Notification(agentName, { body: i.body, tag: i.id });
    }
  }, [messages, requests, agentName]);

  useEffect(() => {
    const reset = () => {
      if (document.visibilityState === "visible") document.title = "Presence";
    };
    document.addEventListener("visibilitychange", reset);
    return () => document.removeEventListener("visibilitychange", reset);
  }, []);

  return permission;
}

/** Offer browser alerts once; the browser only allows asking from a click. */
export function AlertsPrompt({ agentName }: { agentName: string }) {
  const [state, setState] = useState<
    NotificationPermission | "unsupported" | null
  >(null);
  useEffect(() => {
    setState(
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    );
  }, []);
  if (state !== "default") return null;
  return (
    <p className="small" style={{ marginTop: 12 }}>
      <button
        type="button"
        className="linkish small"
        onClick={async () => setState(await Notification.requestPermission())}
      >
        Turn on alerts
      </button>{" "}
      <span className="muted">
        so {agentName} can reach you while this tab is in the background.
      </span>
    </p>
  );
}
