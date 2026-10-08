import { DomainError, type FrameId, type ManifestationId } from "@/core";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** GET one image a session's body captured. Owner and host only. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fid: string }> },
) {
  try {
    const { id, fid } = await params;
    const d = getDeps();
    await access(d, id as ManifestationId, await viewerId());
    const f = await d.repos.frames.get(fid as FrameId);
    if (!f || f.manifestationId !== id)
      throw new DomainError("not_found", "No such image.");
    const bytes = await d.blobs.get(f.blobKey);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": f.mimeType,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
