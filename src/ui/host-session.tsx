"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaptureSession, type CaptureState } from "@/capture";
import { HttpChunkTransport } from "@/client/http-chunk-transport";
import type { CapturePolicy, ManifestationStatus } from "@/core";
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

  // Show the host that the agent is working, without showing them what it found.
  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/manifestations/${id}/feed`).catch(
        () => null,
      );
      if (res?.ok) setObservations((await res.json()).observationCount);
    }, 10_000);
    return () => clearInterval(t);
  }, [id, status]);

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
    await session.current?.stop();
    const res = await fetch(`/api/manifestations/${id}/end`, {
      method: "POST",
    });
    if (res.ok) setStatus("ended");
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
