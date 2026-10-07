import { TransportError, type ChunkTransport, type QueuedChunk } from "@/capture";

/**
 * Connects the capture library to our ingest route. Capture stays ignorant of URLs;
 * this is the only file that knows both sides.
 */
export class HttpChunkTransport implements ChunkTransport {
  constructor(private readonly baseUrl = "") {}

  async send(c: QueuedChunk): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/manifestations/${c.manifestationId}/chunks`, {
        method: "POST",
        headers: {
          "content-type": c.mimeType,
          "x-run-id": c.runId,
          "x-seq": String(c.seq),
          "x-offset-sec": c.offsetSec.toFixed(3),
        },
        body: c.blob,
      });
    } catch (err) {
      throw new TransportError(`network: ${String(err)}`, true);
    }
    if (res.ok) return;
    // 4xx will never succeed (cancelled, unknown manifestation, bad chunk); 5xx, 429 and 425 (not started yet) might.
    const retryable = res.status >= 500 || res.status === 429 || res.status === 425;
    throw new TransportError(`ingest ${res.status}`, retryable);
  }
}
