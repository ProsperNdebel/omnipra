import {
  DomainError,
  FRAME_TYPES,
  MAX_FRAME_BYTES,
  type Frame,
  type FrameId,
  type ManifestationId,
  type Observation,
  type ObservationId,
} from "@/core";
import { loadContext, type Deps } from "./deps";
import { presenceInput } from "./presence";

export interface FrameInput {
  manifestationId: ManifestationId;
  bytes: Uint8Array;
  mimeType: string;
  /** Seconds into the session; worked out from the start time when the device doesn't say. */
  atSec?: number | null;
  caption?: string | null;
}

/**
 * Something the body saw. The image is kept, the agent looks at it with everything it
 * knows about this room, and what matters becomes notes that cite the image.
 */
export async function ingestFrame(
  d: Deps,
  input: FrameInput,
): Promise<{ frame: Frame; notes: Observation[] }> {
  if (!FRAME_TYPES.includes(input.mimeType))
    throw new DomainError(
      "bad_request",
      "Send a JPEG, PNG, WebP or GIF image.",
    );
  if (input.bytes.length === 0 || input.bytes.length > MAX_FRAME_BYTES)
    throw new DomainError("bad_request", "Images must be under 5 MB.");

  const ctx = await loadContext(d, input.manifestationId);
  const m = ctx.manifestation;
  if (m.status === "accepted")
    throw new DomainError("not_started", "The session hasn't started yet.");
  if (m.status !== "live")
    throw new DomainError("not_capturing", `The session is ${m.status}.`);

  const now = d.now();
  const atSec =
    input.atSec ??
    (m.startedAt
      ? Math.max(0, (Date.parse(now) - Date.parse(m.startedAt)) / 1000)
      : null);
  const id = d.newId() as FrameId;
  const frame: Frame = {
    id,
    manifestationId: m.id,
    blobKey: `${m.id}/frames/${id}`,
    mimeType: input.mimeType,
    atSec,
    caption: input.caption?.trim().slice(0, 300) || null,
    createdAt: now,
  };
  await d.blobs.put(frame.blobKey, input.bytes, frame.mimeType);
  // Liveness only: never let it fail an upload.
  await d.repos.manifestations
    .heard(m.id, now)
    .catch((e) => console.error("heard failed", e));
  await d.repos.frames.save(frame);

  const context = await presenceInput(d, ctx, frame.caption ?? "image");
  const seen = await d.agent.see({
    ...context,
    image: { bytes: input.bytes, mimeType: input.mimeType },
    caption: frame.caption,
  });
  const planIds = new Set((ctx.mission.plan ?? []).map((p) => p.id));
  const notes: Observation[] = seen.map((o) => ({
    ...o,
    id: d.newId() as ObservationId,
    agentId: ctx.agent.id,
    manifestationId: m.id,
    evidence: [],
    frames: [frame.id],
    hostRequestId: null,
    planItem: o.planItem && planIds.has(o.planItem) ? o.planItem : null,
    atSec,
    createdAt: now,
  }));
  if (notes.length) {
    await d.repos.observations.append(notes);
    await d.memory.index(notes);
  }
  return { frame, notes };
}
