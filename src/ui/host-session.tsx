"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaptureSession, type CaptureState } from "@/capture";
import { HttpChunkTransport } from "@/client/http-chunk-transport";
import type { CapturePolicy, ManifestationStatus } from "@/core";
import type { HostRequestView } from "@/services/views";
import { Dot } from "./bar";
import { clock, plural } from "./format";

interface Props {
  id: string;
  agentName: string;
  eventTitle: string;
  capturePolicy: CapturePolicy;
  initialStatus: ManifestationStatus;
  startedAt: string | null;
}

/** What the event allows, in the host's words, so they know what they're confirming. */
const POLICY: Record<CapturePolicy, string> = {
  organizer: "The organizer has approved agents at this event.",
  public_talk:
    "Talks on stage may be recorded here. Point your phone at the stage, not at private conversations.",
  none: "This event doesn't allow recording. Don't start.",
};

const WARNINGS: Record<string, string> = {
  page_hidden:
    "Keep this screen open. Recording pauses when you switch apps or lock the phone.",
  low_audio: "It's quiet. Move closer to the speaker if you can.",
  no_wake_lock: "Keep the screen on. This browser can't hold it awake.",
};

export function HostSession({
  id,
  agentName,
  eventTitle,
  capturePolicy,
  initialStatus,
  startedAt,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [cap, setCap] = useState<CaptureState | null>(null);
  const [observations, setObservations] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const session = useRef<CaptureSession | null>(null);

  // One CaptureSession per page. Created after mount: it needs window and IndexedDB,
  // and it immediately resumes uploading anything left from a previous load.
  useEffect(() => {
    const s = new CaptureSession({
      manifestationId: id,
      transport: new HttpChunkTransport(),
      anchorMs: startedAt ? Date.parse(startedAt) : undefined,
    });
    session.current = s;
    const unsub = s.subscribe(setCap);
    return () => {
      unsub();
    };
  }, [id, startedAt]);

  // Show the host that the agent is working, without showing them what it found,
  // and pick up anything the agent asks them to do in the room.
  const [requests, setRequests] = useState<HostRequestView[]>([]);
  const refresh = async () => {
    const res = await fetch(`/api/manifestations/${id}/feed`).catch(() => null);
    if (!res?.ok) return;
    const f = await res.json();
    setObservations(f.observationCount);
    setRequests(f.requests);
  };
  useEffect(() => {
    if (status !== "live") return;
    void refresh();
    const t = setInterval(refresh, 5_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status]);

  // A new ask buzzes the phone where the browser allows it (Android; iOS ignores this).
  const open = requests.filter(
    (r) => r.status === "sent" || r.status === "accepted",
  );
  const seenOpen = useRef(0);
  useEffect(() => {
    if (open.length > seenOpen.current && "vibrate" in navigator) {
      navigator.vibrate([120, 80, 120]);
    }
    seenOpen.current = open.length;
  }, [open.length]);

  async function start() {
    setError(null);
    const s = session.current;
    if (!s) return;
    // Start the mic inside the tap (browsers require a gesture), tell the server in parallel.
    const capturing = s.start();
    if (status === "accepted") {
      const res = await fetch(`/api/manifestations/${id}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captureConfirmed: confirmed }),
      });
      if (!res.ok) {
        setError(
          (await res.json().catch(() => ({}))).message ??
            "Couldn't start the session. Check your connection.",
        );
        return;
      }
      setStatus("live");
    }
    await capturing;
  }

  async function end() {
    setEnding(true);
    // Stop recording and wait for every chunk to reach the server before ending,
    // so the briefing covers the whole session.
    // A bad connection can't hold the host in the room forever: after a while, end
    // anyway. Whatever reached the server is still briefed.
    await Promise.race([
      session.current?.stop(),
      new Promise((r) => setTimeout(r, END_DRAIN_MS)),
    ]);
    const res = await fetch(`/api/manifestations/${id}/end`, {
      method: "POST",
    }).catch(() => null);
    if (res?.ok) setStatus("ended");
    else
      setError(
        "Couldn't end the session. Check your connection and try again.",
      );
    setEnding(false);
  }

  const capturing = cap?.status === "live";
  const pending = cap?.pendingUploads ?? 0;

  if (status === "ended" || status === "briefed") {
    return (
      <main className="session">
        <p>{eventTitle}</p>
        <div className="center">
          <h1 className="title" style={{ marginTop: 0 }}>
            Done.
          </h1>
          <p>
            {agentName} has what it needs and is writing its briefing for its
            owner. You can close this page.
          </p>
        </div>
        <Link href="/host">Back to hosting</Link>
      </main>
    );
  }

  if (status !== "accepted" && status !== "live") {
    return (
      <main className="session">
        <p>{eventTitle}</p>
        <div className="center">
          <p>This session was {status}.</p>
        </div>
        <Link href="/host">Back to hosting</Link>
      </main>
    );
  }

  return (
    <main className="session">
      <div>
        <p style={{ margin: 0 }}>
          <Dot on={capturing} breathe={capturing} />
          {agentName}
        </p>
        <p className="small muted" style={{ marginTop: 4 }}>
          {eventTitle}
        </p>
      </div>

      <div className="center">
        {capturing && open.length > 0 && (
          <ul className="rows" style={{ marginTop: 0, marginBottom: 32 }}>
            {open.map((r) => (
              <HostAsk
                key={r.id}
                sessionId={id}
                agentName={agentName}
                r={r}
                onDone={refresh}
              />
            ))}
          </ul>
        )}
        {capturing ? (
          <>
            <p className="clock">{clock(cap?.elapsedSec ?? 0)}</p>
            <p>
              {agentName} is listening. {plural(observations, "observation")} so
              far.
            </p>
            <div className="meter" aria-hidden="true">
              <i
                style={{
                  width: `${Math.min(100, Math.round((cap?.level ?? 0) * 900))}%`,
                }}
              />
            </div>
            {cap?.warning && <p className="error">{WARNINGS[cap.warning]}</p>}
            <SnapPhoto sessionId={id} agentName={agentName} />
            {pending > 1 && (
              <p className="small muted">
                {plural(pending, "chunk")} waiting to upload.
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="title" style={{ marginTop: 0 }}>
              {status === "live" ? `Resume ${agentName}` : `Start ${agentName}`}
            </h1>
            <p>
              Your microphone is used while this screen is open, and nothing
              else on your phone is touched.
            </p>
            <p className="small muted">{POLICY[capturePolicy]}</p>
            {status === "accepted" && (
              <label
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  marginTop: 20,
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ marginTop: 4, flex: "none" }}
                />
                <span>
                  Recording is allowed where I am, and people speaking near me
                  know an AI note taker is listening.
                </span>
              </label>
            )}
            <p className="small muted">
              Keep the screen on and this page in front for the whole session.
            </p>
          </>
        )}
        {(error || cap?.error) && (
          <p className="error" role="alert">
            {error ?? cap?.error}
          </p>
        )}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {capturing ? (
          <button className="button huge quiet" onClick={end} disabled={ending}>
            {ending
              ? pending > 0
                ? `Uploading ${plural(pending, "chunk")}`
                : "Ending"
              : "End session"}
          </button>
        ) : (
          <button
            className="button huge"
            onClick={start}
            disabled={
              cap?.status === "starting" ||
              (status === "accepted" && !confirmed)
            }
          >
            {status === "live" ? `Resume ${agentName}` : `Start ${agentName}`}
          </button>
        )}
      </div>
    </main>
  );
}

/**
 * Something the agent asks the host to do in the room. The host can add what they
 * heard, then mark it done or say they couldn't. Either way the owner sees it.
 */
/**
 * A request from the agent, in two steps so its owner knows where things stand:
 * the host says they'll do it, then reports what they found out.
 */
function HostAsk({
  sessionId,
  agentName,
  r,
  onDone,
}: {
  sessionId: string;
  agentName: string;
  r: HostRequestView;
  onDone: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"accept" | "done" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accepted = r.status === "accepted";

  async function act(event: "accept" | "done" | "decline") {
    setBusy(event);
    setError(null);
    const res = await fetch(
      `/api/manifestations/${sessionId}/requests/${r.id}/${event}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostNote: note }),
      },
    ).catch(() => null);
    if (res?.ok) await onDone();
    else setError("That didn't go through. Try again.");
    setBusy(null);
  }

  return (
    <li className="proposal" style={{ display: "block" }}>
      <div className="small muted">
        {accepted ? "You said you'd do this" : `${agentName} has a request`}
      </div>
      <div style={{ marginTop: 4, fontSize: "var(--t-md)", fontWeight: 600 }}>
        {r.ask}
      </div>
      {accepted && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="What did you find out?"
          aria-label="What you found out"
          style={{ marginTop: 12 }}
        />
      )}
      <div className="actions" style={{ marginTop: 12 }}>
        {accepted ? (
          <button
            className="button"
            onClick={() => act("done")}
            disabled={!!busy}
          >
            {busy === "done" ? "Saving" : "Done"}
          </button>
        ) : (
          <button
            className="button"
            onClick={() => act("accept")}
            disabled={!!busy}
          >
            {busy === "accept" ? "Saving" : "I'll ask"}
          </button>
        )}
        <button
          className="button quiet"
          onClick={() => act("decline")}
          disabled={!!busy}
        >
          {busy === "decline"
            ? "Saving"
            : accepted
              ? "Couldn't"
              : "Can't right now"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The phone's camera as the agent's eyes: point it at a slide, a whiteboard or a
 * badge, and the agent reads it. Opens the camera directly on phones.
 */
function SnapPhoto({
  sessionId,
  agentName,
}: {
  sessionId: string;
  agentName: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [caption, setCaption] = useState("");

  async function send(file: File) {
    setState("sending");
    const image = await shrink(file);
    const res = await fetch(`/api/manifestations/${sessionId}/frames`, {
      method: "POST",
      headers: {
        "content-type": image.type,
        ...(caption.trim()
          ? { "x-caption": encodeURIComponent(caption.trim()) }
          : {}),
      },
      body: image,
    }).catch(() => null);
    setState(res?.ok ? "sent" : "error");
    if (res?.ok) setCaption("");
  }

  return (
    <div style={{ marginTop: 20 }}>
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={300}
        placeholder="What is it? (optional) The pricing slide"
        aria-label="What the photo shows"
      />
      <label
        className="button quiet"
        style={{ display: "inline-block", marginTop: 12, cursor: "pointer" }}
      >
        {state === "sending" ? "Sending" : `Show ${agentName} something`}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          disabled={state === "sending"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void send(f);
            e.target.value = "";
          }}
        />
      </label>
      {state === "sent" && <p className="small muted">{agentName} has it.</p>}
      {state === "error" && (
        <p className="error">That photo didn&rsquo;t go through. Try again.</p>
      )}
    </div>
  );
}

/** How long ending waits for the last audio to upload before giving up on it. */
const END_DRAIN_MS = 30_000;
/** Longest side of a photo sent to the agent. Plenty to read a slide, small on mobile data. */
const PHOTO_MAX_PX = 1600;

/**
 * Phone photos are often 4 to 12 MB. Scale down to a JPEG the agent can still read,
 * so it uploads quickly on event wifi. Falls back to the original if the browser can't.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height),
    );
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
