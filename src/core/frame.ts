import type { FrameId, ISODate, ManifestationId } from "./ids";

/**
 * One image from a body's camera: a slide, a whiteboard, a badge, a booth. What the
 * agent sees becomes notes that cite the frame, the way heard notes cite transcript.
 */
export interface Frame {
  id: FrameId;
  manifestationId: ManifestationId;
  blobKey: string;
  mimeType: string;
  /** Seconds into the session when it was taken. */
  atSec: number | null;
  /** What the host or device said about it, if anything ("the pricing slide"). */
  caption: string | null;
  createdAt: ISODate;
}

/** Image types vision understands, and a size bound so one upload can't swamp a session. */
export const FRAME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
export const MAX_FRAME_BYTES = 5 * 1024 * 1024;
