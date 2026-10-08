"use client";

import { useEffect, useState } from "react";
import { decideAction } from "@/app/actions";
import type { Observation, ObservationId, ObservationKind } from "@/core";
import type { Feed } from "@/services/views";
import { Dot, STATUS_WORDS } from "./bar";
import { clock, fmtTime, plural } from "./format";
import { SubmitButton } from "./submit-button";

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
            <SubmitButton pending="Cancelling" quiet>
              Cancel request
            </SubmitButton>
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

      {f.briefing && <Briefing b={f.briefing} notes={obs} />}

      {important.length > 0 && (
        <section className="narrow">
          <h2 className="section">Worth acting on</h2>
          <Observations list={important} sessionId={id} />
        </section>
      )}
      {rest.length > 0 && (
        <section className="narrow">
          <h2 className="section">
            {f.briefing ? "Everything else it noted" : "Notes"}
          </h2>
          <Observations list={rest} sessionId={id} />
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

/** Latest first, by when it was said in the room. Older notes without atSec fall back to processing time. */
function byWhenSaid(a: Observation, b: Observation): number {
  if (a.atSec !== null && b.atSec !== null) return b.atSec - a.atSec;
  return b.createdAt.localeCompare(a.createdAt);
}

/** Talk time without a leading zero: "1:34". */
const talkTime = (sec: number) => clock(sec).replace(/^0(?=\d:)/, "");

/** "4:12 in" from the start of the session; older notes show the clock time they were processed. */
function when(o: Observation): string {
  return o.atSec !== null
    ? `${talkTime(o.atSec)} in`
    : `at ${fmtTime(o.createdAt)}`;
}

const noteAnchor = (id: string) => `note-${id}`;

function Observations({
  list,
  sessionId,
}: {
  list: Observation[];
  sessionId: string;
}) {
  return (
    <ul className="rows">
      {[...list].sort(byWhenSaid).map((o) => (
        <li key={o.id} id={noteAnchor(o.id)}>
          <div className="full">
            <div className="small muted">
              {KIND[o.kind]}, {when(o)}
              {o.alert && `, matched "${o.alert}"`}
            </div>
            <div style={{ marginTop: 4 }}>{o.text}</div>
            <Source note={o} sessionId={sessionId} />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface Line {
  id: string;
  startSec: number;
  speaker: string | null;
  text: string;
}

/**
 * The exact transcript a note rests on, loaded when opened. Opens by itself when a
 * briefing citation links to this note, so a claim is two clicks from the audio.
 */
function Source({ note, sessionId }: { note: Observation; sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${noteAnchor(note.id)}`) setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [note.id]);

  useEffect(() => {
    if (!open || lines || note.evidence.length === 0) return;
    const ids = note.evidence.map(encodeURIComponent).join(",");
    fetch(`/api/manifestations/${sessionId}/sources?ids=${ids}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { lines: Line[] }) => setLines(b.lines))
      .catch(() => setError(true));
  }, [open, lines, note.evidence, sessionId]);

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="linkish small"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide source" : "Source"}
      </button>
      {open && (
        <div className="source">
          {error ? (
            <p className="small">
              Couldn&rsquo;t load the transcript. Try again.
            </p>
          ) : !lines ? (
            <p className="small muted">Loading</p>
          ) : lines.length === 0 ? (
            <p className="small muted">
              The transcript for this note is no longer available.
            </p>
          ) : (
            lines.map((l) => (
              <p key={l.id} className="small">
                <span className="muted">{talkTime(l.startSec)}</span> &ldquo;
                {l.text}&rdquo;
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** "Based on 1:34, 0:48": each time jumps to the note and opens its transcript. */
function Cites({
  ids,
  notes,
}: {
  ids: ObservationId[] | undefined;
  notes: Map<string, Observation>;
}) {
  const cited = (ids ?? [])
    .map((id) => notes.get(id))
    .filter((o): o is Observation => !!o)
    .sort((a, b) => (a.atSec ?? 0) - (b.atSec ?? 0));
  if (cited.length === 0) return null;
  return (
    <span className="small muted" style={{ display: "block", marginTop: 2 }}>
      Based on{" "}
      {cited.map((o, i) => (
        <span key={o.id}>
          {i > 0 && ", "}
          <a href={`#${noteAnchor(o.id)}`}>
            {o.atSec !== null ? talkTime(o.atSec) : fmtTime(o.createdAt)}
          </a>
        </span>
      ))}
    </span>
  );
}

function Briefing({
  b,
  notes,
}: {
  b: NonNullable<Feed["briefing"]>;
  notes: Observation[];
}) {
  const byId = new Map(notes.map((o) => [o.id as string, o]));
  return (
    <section className="briefing narrow">
      <h2 className="section">Briefing</h2>
      {b.headline.length > 0 && (
        <ol>
          {b.headline.map((h, i) => (
            <li key={i}>
              {h}
              <Cites ids={b.cites?.headline[i]} notes={byId} />
            </li>
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
                  <Cites ids={b.cites?.followUps[i]} notes={byId} />
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
