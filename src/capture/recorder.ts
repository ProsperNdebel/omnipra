/**
 * Records a mic stream as a series of standalone audio files.
 *
 * Why not MediaRecorder's timeslice? With timeslice only the first blob carries the
 * container header, so chunk 7 can't be transcribed on its own. Instead we run one
 * MediaRecorder per chunk and rotate. The next recorder starts before the old one stops,
 * so chunks overlap by a few ms rather than dropping words in a gap.
 */

export interface RecordedChunk {
  /** Random per recorder run, so a reload or restart never reuses (runId, seq). */
  runId: string;
  seq: number;
  /** Seconds from the anchor (the manifestation's start) to the start of this chunk. */
  offsetSec: number;
  durationSec: number;
  blob: Blob;
  mimeType: string;
}

const CANDIDATES = [
  "audio/webm;codecs=opus", // Chrome, Android, Firefox
  "audio/mp4;codecs=mp4a.40.2", // Safari
  "audio/mp4",
  "audio/webm",
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder is not available in this browser");
  const found = CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!found) throw new Error("No supported audio recording format");
  return found;
}

export interface RecorderOptions {
  chunkSec: number;
  mimeType: string;
  /** Epoch ms that offset 0 refers to. Defaults to when start() is called. */
  anchorMs?: number;
  bitsPerSecond?: number;
  onChunk: (chunk: RecordedChunk) => void;
  onError: (err: Error) => void;
}

export class SegmentedRecorder {
  private seq = 0;
  private readonly runId = crypto.randomUUID();
  /** performance.now() value that corresponds to the anchor. */
  private origin = 0;
  private current: { rec: MediaRecorder; startedAt: number; done: Promise<void> } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private readonly stream: MediaStream, private readonly opts: RecorderOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    // performance.now() is monotonic, Date.now() is not; translate the anchor once.
    const now = performance.now();
    this.origin = now - (Date.now() - (this.opts.anchorMs ?? Date.now()));
    this.current = this.open();
    this.schedule();
  }

  /** Stops recording and resolves once the final partial chunk has been emitted. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    const last = this.current;
    this.current = null;
    if (last) {
      last.rec.stop();
      await last.done;
    }
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      if (!this.running || !this.current) return;
      const old = this.current;
      this.current = this.open();
      old.rec.stop();
      this.schedule();
    }, this.opts.chunkSec * 1000);
  }

  private open() {
    const { mimeType, bitsPerSecond = 32_000 } = this.opts;
    const rec = new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: bitsPerSecond });
    const seq = this.seq++;
    const startedAt = performance.now();
    const parts: Blob[] = [];

    const done = new Promise<void>((resolve) => {
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) parts.push(e.data);
      };
      rec.onstop = () => {
        const endedAt = performance.now();
        if (parts.length > 0) {
          this.opts.onChunk({
            runId: this.runId,
            seq,
            offsetSec: (startedAt - this.origin) / 1000,
            durationSec: (endedAt - startedAt) / 1000,
            blob: new Blob(parts, { type: mimeType }),
            mimeType,
          });
        }
        resolve();
      };
      rec.onerror = (e) => {
        const err = (e as unknown as { error?: Error }).error ?? new Error("MediaRecorder error");
        this.opts.onError(err);
        resolve();
      };
    });

    rec.start();
    return { rec, startedAt, done };
  }
}
