import type { ManifestationId } from "@/core";
import { setPaused } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** POST { paused: boolean }: the host pauses or resumes listening. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { paused?: unknown } | null;
    await setPaused(getDeps(), id as ManifestationId, await viewerId(), body?.paused === true);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
