import { DomainError, type ManifestationId } from "@/core";
import { brief } from "@/pipeline";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";
// Writing a briefing can take a while with a long transcript.
export const maxDuration = 60;

/**
 * POST: write (or rewrite) the briefing now. Used when the automatic one after End failed.
 * Safe to repeat: brief() returns the stored briefing if one exists, and any transcript
 * that failed to process earlier is still waiting behind the cursor.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const d = getDeps();
    const a = await access(d, id as ManifestationId, await viewerId());
    if (!a.isOwner) throw new DomainError("forbidden", "Only the agent's owner can request the briefing.");
    if (a.manifestation.status !== "ended" && a.manifestation.status !== "briefed") {
      throw new DomainError("bad_request", "The session hasn't ended yet.");
    }
    return Response.json({ briefing: await brief(d, a.manifestation.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
