import { LevelMeter } from "./level-meter";
import { ChunkQueue } from "./queue";
import { pickMimeType, SegmentedRecorder, type RecordedChunk } from "./recorder";
import { Uploader, type ChunkTransport } from "./uploader";
import { ScreenWakeLock } from "./wake-lock";

/**
 * One host's capture for one manifestation. Framework agnostic: the host page
 * subscribes to state and calls start() from a tap (browsers require a user gesture for the mic).
 */

export type CaptureStatus = "idle" | "starting" | "live" | "stopping" | "stopped" | "error";

export interface CaptureState {
  status: CaptureStatus;
  elapsedSec: number;
  chunksRecorded: number;
  pendingUploads: number;
  level: number;
  /** Things the host should fix: page hidden, mic lost, audio too quiet. */
  warning: CaptureWarning | null;
  error: string | null;
}

export type CaptureWarning = "page_hidden" | "low_audio" | "no_wake_lock";

export interface CaptureOptions {
  manifestationId: string;
  transport: ChunkTransport;
  /** Manifestation startedAt from the server (epoch ms). Keeps offsets right across reloads and restarts. */
  anchorMs?: number;
  chunkSec?: number;
  /** RMS below this for `lowAudioSec` raises low_audio. Tune in the field. */
  lowAudioThreshold?: number;
  lowAudioSec?: number;
}

type Listener = (s: CaptureState) => void;

export class CaptureSession {
  private state: CaptureState = {
    status: "idle",
    elapsedSec: 0,
    chunksRecorded: 0,
    pendingUploads: 0,
    level: 0,
    warning: null,
    error: null,
  };
  private listeners = new Set<Listener>();
  private stream: MediaStream | null = null;
  private recorder: SegmentedRecorder | null = null;
  private readonly queue = new ChunkQueue();
  private readonly uploader: Uploader;
  private readonly wakeLock = new ScreenWakeLock();
  private readonly meter = new LevelMeter();
  private clock: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private quietSince: number | null = null;
  private readonly onVisibility = () =>
    this.set({ warning: document.visibilityState === "hidden" ? "page_hidden" : null });

  constructor(private readonly opts: CaptureOptions) {
    this.uploader = new Uploader(this.queue, opts.transport, {
      onPending: (n) => this.set({ pendingUploads: n }),
    });
    // Chunks left over from a crash or reload start uploading right away.
    this.uploader.start();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  async start(): Promise<void> {
    if (this.state.status !== "idle" && this.state.status !== "error") return;
    this.set({ status: "starting", error: null });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // Browser defaults are tuned for someone talking into the phone. For a speaker
          // across a room, echo cancellation and noise suppression mostly eat the voice.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch (err) {
      this.fail(err instanceof Error && err.name === "NotAllowedError" ? "Microphone access was denied" : String(err));
      return;
    }

    for (const track of this.stream.getAudioTracks()) {
      track.onended = () => this.fail("The microphone was disconnected or taken by another app");
    }

    this.recorder = new SegmentedRecorder(this.stream, {
      chunkSec: this.opts.chunkSec ?? 20,
      mimeType: pickMimeType(),
      anchorMs: this.opts.anchorMs,
      onChunk: (c) => void this.enqueue(c),
      onError: (e) => this.fail(e.message),
    });

    await this.wakeLock.enable();
    if (!this.wakeLock.supported) this.set({ warning: "no_wake_lock" });
    document.addEventListener("visibilitychange", this.onVisibility);
    this.meter.start(this.stream, (rms) => this.onLevel(rms));

    this.startedAt = Date.now();
    this.clock = setInterval(() => this.set({ elapsedSec: Math.floor((Date.now() - this.startedAt) / 1000) }), 1000);
    this.recorder.start();
    this.set({ status: "live" });
  }

  /** Stops capture. Resolves when every chunk has reached the server. */
  async stop(): Promise<void> {
    if (this.state.status !== "live") return;
    this.set({ status: "stopping" });
    await this.recorder?.stop();
    await this.release();
    await this.uploader.drained();
    this.set({ status: "stopped" });
  }

  private async enqueue(c: RecordedChunk): Promise<void> {
    await this.queue.put({
      manifestationId: this.opts.manifestationId,
      runId: c.runId,
      seq: c.seq,
      offsetSec: c.offsetSec,
      durationSec: c.durationSec,
      mimeType: c.mimeType,
      blob: c.blob,
      queuedAt: Date.now(),
    });
    this.set({ chunksRecorded: this.state.chunksRecorded + 1 });
    this.uploader.kick();
  }

  private onLevel(rms: number): void {
    const threshold = this.opts.lowAudioThreshold ?? 0.01;
    const windowMs = (this.opts.lowAudioSec ?? 15) * 1000;
    const now = Date.now();
    if (rms < threshold) this.quietSince ??= now;
    else this.quietSince = null;

    const quiet = this.quietSince !== null && now - this.quietSince > windowMs;
    const warning =
      this.state.warning === "page_hidden" ? "page_hidden" : quiet ? "low_audio" : this.state.warning === "low_audio" ? null : this.state.warning;
    this.set({ level: rms, warning });
  }

  private async release(): Promise<void> {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    await this.meter.stop();
    await this.wakeLock.disable();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private fail(message: string): void {
    void this.recorder?.stop();
    void this.release();
    this.set({ status: "error", error: message });
  }

  private set(patch: Partial<CaptureState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}
