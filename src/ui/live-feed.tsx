"use client";

import { useEffect, useState } from "react";
import { decideAction } from "@/app/actions";
import type { Observation, ObservationKind } from "@/core";
import type { Feed } from "@/services/views";
import { Dot, STATUS_WORDS } from "./bar";
import { fmtTime, plural } from "./format";

const POLL_MS = 8_000;
const DONE = new Set(["briefed", "declined", "cancelled"]);

const KIND: Record<ObservationKind, string> = {
  insight: "Insight",
  person: "Person",
  company: "Company",
  opportunity: "Opportunity",
  question: "Open question",
  number: "Number",
};

export function LiveFeed({
  id,
  agentName,
  hostName,
  initial,
}: {
  id: string;
  agentName: string;
  hostName: string;
  initial: Feed;
}) {
  const [f, setF] = useState(initial);

  useEffect(() => {
    if (DONE.has(f.status)) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/manifestations/${id}/feed`).catch(
        () => null,
      );
      if (res?.ok) setF(await res.json());
    }, POLL_MS);
    return () => clearInterval(t);
  }, [id, f.status]);

  const obs = f.observations ?? [];
  const important = obs.filter((o) => o.importance === 3 || o.alert);
  const rest = obs.filter((o) => !(o.importance === 3 || o.alert));
  const live = f.status === "live";

  return (
    <>
      <p style={{ marginTop: 28 }}>
        <Dot on={live} breathe={live} />
        {STATUS_WORDS[f.status]}
        {live && obs.length > 0 && `, ${plural(obs.length, "observation")}`}
      </p>

      {f.status === "requested" && (
        <>
          <p className="muted">
            {hostName} hasn&rsquo;t answered yet. {agentName} starts once they
            accept and open the session at the event.
          </p>
          <form action={decideAction} style={{ marginTop: 20 }}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value="cancel" />
            <button className="button quiet">Cancel request</button>
          </form>
        </>
      )}
      {f.status === "accepted" && (
        <p className="muted">
          {hostName} accepted. {agentName} goes live when they start the session
          in the room.
        </p>
      )}
      {live && obs.length === 0 && (
        <p className="muted">
          {agentName} is listening. Notes appear about a minute behind the room,
          once there&rsquo;s enough to work with.
        </p>
      )}

      {f.status === "ended" && (
        <RetryBriefing
          id={id}
          agentName={agentName}
          onDone={async () => {
            const res = await fetch(`/api/manifestations/${id}/feed`);
            if (res.ok) setF(await res.json());
          }}
        />
      )}

      {f.briefing && <Briefing b={f.briefing} />}

      {important.length > 0 && (
        <section className="narrow">
          <h2 className="section">Worth acting on</h2>
          <Observations list={important} />
        </section>
      )}
      {rest.length > 0 && (
        <section className="narrow">
          <h2 className="section">
            {f.briefing ? "Everything else it noted" : "Notes"}
          </h2>
          <Observations list={rest} />
        </section>
      )}
    </>
  );
}

/**
 * The briefing is written automatically after End. If that failed (provider down, bad key),
 * the session would sit here forever, so the owner can ask for it again.
 */
function RetryBriefing({
  id,
  agentName,
  onDone,
}: {
  id: string;
  agentName: string;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/manifestations/${id}/brief`, {
      method: "POST",
    }).catch(() => null);
    if (res?.ok) await onDone();
    else
      setError(
        (await res?.json().catch(() => null))?.message ??
          `${agentName} couldn't write the briefing. Try again in a moment.`,
      );
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 20 }}>
      <p className="muted">
        This usually takes under a minute. If it&rsquo;s been longer, ask for it
        again.
      </p>
      <button
        className="button quiet"
        onClick={retry}
        disabled={busy}
        style={{ marginTop: 16 }}
      >
        {busy ? "Writing the briefing" : "Write the briefing now"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Observations({ list }: { list: Observation[] }) {
  return (
    <ul className="rows">
      {[...list].reverse().map((o) => (
        <li key={o.id}>
          <div className="full">
            <div className="small muted">
              {KIND[o.kind]} at {fmtTime(o.createdAt)}
              {o.alert && `, matched "${o.alert}"`}
            </div>
            <div style={{ marginTop: 4 }}>{o.text}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Briefing({ b }: { b: NonNullable<Feed["briefing"]> }) {
  return (
    <section className="briefing narrow">
      <h2 className="section">Briefing</h2>
      {b.headline.length > 0 && (
        <ol>
          {b.headline.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      )}
      {b.followUps.length > 0 && (
        <>
          <h2 className="section">Follow up with</h2>
          <ul className="rows">
            {b.followUps.map((p, i) => (
              <li key={i}>
                <div className="full">
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div>{p.why}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {b.openQuestions.length > 0 && (
        <>
          <h2 className="section">Still unanswered</h2>
          <ul>
            {b.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
