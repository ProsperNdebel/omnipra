import { after } from "next/server";
import { ABANDONED_AFTER_SEC, type ManifestationId } from "@/core";
import { sweepAbandoned } from "@/pipeline";
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
    const f = await feed(d, a, a.isOwner);
    // Without a scheduler, whoever is watching notices a vanished host.
    if (f.silentSec !== null && f.silentSec >= ABANDONED_AFTER_SEC)
      after(() =>
        sweepAbandoned(d).catch((e) => console.error("sweep failed", e)),
      );
    return Response.json(f, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
