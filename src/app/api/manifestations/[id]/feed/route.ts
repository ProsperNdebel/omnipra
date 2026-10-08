import type { ManifestationId } from "@/core";
import { access, feed } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** GET: what live views poll. The owner gets observations and the briefing; the host gets counts. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const d = getDeps();
    const a = await access(d, id as ManifestationId, await viewerId());
    return Response.json(await feed(d, a, a.isOwner), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
