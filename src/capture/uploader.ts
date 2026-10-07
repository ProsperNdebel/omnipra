import type { ChunkQueue, QueuedChunk } from "./queue";

/**
 * How chunks leave the device. The capture library knows nothing about our API;
 * the app passes a transport. Throw TransportError(retryable: false) for responses
 * that will never succeed (e.g. the manifestation was cancelled) so the chunk is dropped.
 */
export interface ChunkTransport {
  send(chunk: QueuedChunk): Promise<void>;
}

export class TransportError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "TransportError";
  }
}

export interface UploaderEvents {
  onPending?: (count: number) => void;
  onDropped?: (chunk: QueuedChunk, err: Error) => void;
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Drains the queue oldest first, one chunk at a time, with capped exponential backoff. */
export class Uploader {
  private running = false;
  private wake: (() => void) | null = null;
  private backoff = MIN_BACKOFF_MS;
  private readonly onOnline = () => this.kick();

  constructor(
    private readonly queue: ChunkQueue,
    private readonly transport: ChunkTransport,
    private readonly events: UploaderEvents = {},
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener("online", this.onOnline);
    void this.loop();
  }

  stop(): void {
    this.running = false;
    window.removeEventListener("online", this.onOnline);
    this.kick();
  }

  /** Call after enqueueing so an idle loop picks the chunk up immediately. */
  kick(): void {
    this.wake?.();
  }

  /** Resolves once nothing is left to upload. */
  async drained(): Promise<void> {
    while ((await this.queue.count()) > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const chunk = await this.queue.oldest();
      this.events.onPending?.(await this.queue.count());

      if (!chunk) {
        await this.sleep(Infinity);
        continue;
      }

      try {
        await this.transport.send(chunk);
        await this.queue.remove(chunk);
        this.backoff = MIN_BACKOFF_MS;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (e instanceof TransportError && !e.retryable) {
          await this.queue.remove(chunk);
          this.events.onDropped?.(chunk, e);
          continue;
        }
        await this.sleep(this.backoff * (0.75 + Math.random() * 0.5));
        this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        if (timer) clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = Number.isFinite(ms) ? setTimeout(done, ms) : null;
      this.wake = done;
    });
  }
}
