import { after } from "next/server";
import type { ManifestationId } from "@/core";
import { brief, meetOthers } from "@/pipeline";
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
    if (action === "start")
      after(() =>
        meetOthers(d, mid).catch((e) => console.error("meet failed", e)),
      );
    if (action === "end")
      after(() => brief(d, mid).catch((e) => console.error("brief failed", e)));
    return { session: { id: m.id, status: m.status } };
  });
}
