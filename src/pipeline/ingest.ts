import {
  DomainError,
  type ManifestationId,
  type SegmentId,
  type TranscriptSegment,
} from "@/core";
import type { Deps } from "./deps";

export interface ChunkInput {
  manifestationId: ManifestationId;
  runId: string;
  seq: number;
  offsetSec: number;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Store one chunk and transcribe it. Idempotent: the blob key and segment ids are
 * derived from (manifestation, run, seq), so a client retry after a lost response
 * overwrites rather than duplicates.
 *
 * Chunks are accepted while live and after end, because the host's outbox can still
 * be draining when the session is ended.
 */
export async function ingestChunk(
  d: Deps,
  c: ChunkInput,
): Promise<{ segments: number }> {
  const m = await d.repos.manifestations.get(c.manifestationId);
  if (!m)
    throw new DomainError(
      "not_found",
      `manifestation ${c.manifestationId} not found`,
    );
  // The host's phone starts recording on tap and tells the server in parallel, so the
  // first chunk can beat the start call. Retryable, not a rejection.
  if (m.status === "accepted")
    throw new DomainError("not_started", "manifestation has not started yet");
  if (m.status !== "live" && m.status !== "ended") {
    throw new DomainError("not_capturing", `manifestation is ${m.status}`);
  }

  await d.blobs.put(
    `${c.manifestationId}/${c.runId}/${String(c.seq).padStart(6, "0")}`,
    c.bytes,
    c.mimeType,
  );
  // Liveness only: never let it fail an upload.
  await d.repos.manifestations
    .heard(c.manifestationId, d.now())
    .catch((e) => console.error("heard failed", e));

  const raw = await d.asr.transcribe({
    bytes: c.bytes,
    mimeType: c.mimeType,
    offsetSec: c.offsetSec,
  });
  const segments: TranscriptSegment[] = raw
    .filter((s) => s.text.trim().length > 0)
    .map((s, i) => ({
      ...s,
      id: `${c.manifestationId}:${c.runId}:${c.seq}:${i}` as SegmentId,
      manifestationId: c.manifestationId,
    }));

  if (segments.length > 0) await d.repos.segments.append(segments);
  return { segments: segments.length };
}
