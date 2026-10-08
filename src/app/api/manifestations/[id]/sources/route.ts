import { DomainError, type ManifestationId, type SegmentId } from "@/core";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** Most lines a single note can cite in practice; caps the request. */
const MAX_IDS = 50;

/**
 * GET ?ids=a,b,c: the transcript lines behind a note, so the owner can check
 * exactly what was said. Owner only; hosts never see content.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ids = (new URL(req.url).searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) badRequest("ids is required");
    if (ids.length > MAX_IDS) badRequest(`at most ${MAX_IDS} ids`);

    const d = getDeps();
    const a = await access(d, id as ManifestationId, await viewerId());
    if (!a.isOwner) {
      throw new DomainError(
        "forbidden",
        "Only the agent's owner can read sources.",
      );
    }

    const lines = await d.repos.segments.byIds(
      a.manifestation.id,
      ids as SegmentId[],
    );
    return Response.json(
      {
        lines: lines.map((s) => ({
          id: s.id,
          startSec: s.startSec,
          speaker: s.speaker,
          text: s.text,
        })),
      },
      { headers: { "cache-control": "private, max-age=3600" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
