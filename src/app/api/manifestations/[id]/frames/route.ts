import { DomainError, type ManifestationId } from "@/core";
import { ingestFrame } from "@/pipeline";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** POST raw image from the host's phone (x-caption optional) → the notes made from it. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const d = getDeps();
    const a = await access(d, id as ManifestationId, await viewerId());
    if (!a.isHost)
      throw new DomainError(
        "forbidden",
        "Only the host's device can send images.",
      );
    const caption = req.headers.get("x-caption");
    const { notes } = await ingestFrame(d, {
      manifestationId: a.manifestation.id,
      bytes: new Uint8Array(await req.arrayBuffer()),
      mimeType: req.headers.get("content-type") ?? "",
      caption: caption ? decodeURIComponent(caption) : null,
    });
    return Response.json({ notes: notes.length });
  } catch (err) {
    return errorResponse(err);
  }
}
