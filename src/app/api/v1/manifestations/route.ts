import { queue } from "@/server/jobs";
import { v1 } from "@/services";
import { withCaller } from "@/server/api";

export const runtime = "nodejs";

/**
 * POST /api/v1/manifestations
 * { event_id, host_id?, instructions?, budget_cents?, capabilities?: ["audio","host_requests"], autonomy? }
 * → the session. Its plan is drafted in the background.
 */
export function POST(req: Request) {
  return withCaller(req, async (d, caller) => {
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<
      string,
      unknown
    >;
    const { session, missionId } = await v1.manifest(d, caller, body);
    await queue(d, "plan", { missionId });
    return { manifestation: session };
  });
}
