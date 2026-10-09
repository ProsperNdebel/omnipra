import type { ManifestationId } from "@/core";
import { drainSoon, queue } from "@/server/jobs";
import { deviceTransition } from "@/services";
import { withDevice } from "@/server/api";

export const runtime = "nodejs";

/**
 * POST /api/v1/device/sessions/:id/{accept|decline|start|end}
 * start needs { "capture_confirmed": true }: whoever set the device up confirms
 * recording is allowed where it is and people nearby know.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  return withDevice(req, async (d, device) => {
    const body = (await req.json().catch(() => null)) as {
      capture_confirmed?: unknown;
    } | null;
    const m = await deviceTransition(
      d,
      device,
      id,
      action,
      body?.capture_confirmed === true,
    );
    const mid = m.id as ManifestationId;
    if (action === "start") await queue(d, "meet", { id: mid });
    if (action === "end") await queue(d, "brief", { id: mid });
    drainSoon(d, 0);
    return { session: { id: m.id, status: m.status } };
  });
}
