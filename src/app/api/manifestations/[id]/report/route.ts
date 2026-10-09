import { reportSession } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** POST { reason, block? }: flag this session. A host can block the owner at the same time. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      reason?: unknown;
      block?: unknown;
    };
    await reportSession(getDeps(), await viewerId(), id, {
      reason: typeof body.reason === "string" ? body.reason : "",
      block: body.block === true,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
