import { v1 } from "@/services";
import { withCaller } from "@/server/api";

export const runtime = "nodejs";

/**
 * GET /api/v1/manifestations/:id/stream?after_sec=0&since=ISO
 * → new transcript, notes, messages, requests and the briefing, plus the next cursor.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  return withCaller(req, (d, caller) =>
    v1.stream(d, caller, id, {
      afterSec: Number(q.get("after_sec") ?? 0) || 0,
      since: q.get("since") ?? "1970-01-01T00:00:00.000Z",
    }),
  );
}
