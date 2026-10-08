import { ingestFrame } from "@/pipeline";
import { deviceSession } from "@/services";
import { withDevice } from "@/server/api";
import { badRequest } from "@/server/http";

export const runtime = "nodejs";

/**
 * POST /api/v1/device/sessions/:id/frames
 * Raw image body (JPEG, PNG, WebP or GIF). Optional x-at-sec and x-caption headers.
 * Returns the notes the agent made from it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withDevice(req, async (d, device) => {
    if (!device.capabilities.includes("camera"))
      badRequest("This device can't see.");
    const m = await deviceSession(d, device, id);
    const at = req.headers.get("x-at-sec");
    const { frame, notes } = await ingestFrame(d, {
      manifestationId: m.id,
      bytes: new Uint8Array(await req.arrayBuffer()),
      mimeType: req.headers.get("content-type") ?? "",
      atSec: at === null ? null : Number(at),
      caption: req.headers.get("x-caption"),
    });
    return {
      frame: { id: frame.id, at_sec: frame.atSec },
      notes: notes.map((n) => ({ id: n.id, text: n.text, basis: n.basis })),
    };
  });
}
