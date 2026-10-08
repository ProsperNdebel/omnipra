import { after } from "next/server";
import { ingestChunk, observe } from "@/pipeline";
import { deviceSession } from "@/services";
import { withDevice } from "@/server/api";
import { badRequest } from "@/server/http";

export const runtime = "nodejs";

/**
 * POST /api/v1/device/sessions/:id/audio
 * Raw audio body (any type the transcriber accepts), with x-run-id, x-seq and
 * x-offset-sec headers. Same contract as the phone: idempotent per (run, seq).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withDevice(req, async (d, device) => {
    if (!device.capabilities.includes("mic"))
      badRequest("This device can't hear.");
    const m = await deviceSession(d, device, id);
    const runId = req.headers.get("x-run-id") ?? badRequest("missing x-run-id");
    const seq = Number(req.headers.get("x-seq"));
    const offsetSec = Number(req.headers.get("x-offset-sec"));
    const mimeType =
      req.headers.get("content-type") ?? badRequest("missing content-type");
    if (!Number.isInteger(seq) || seq < 0) badRequest("bad x-seq");
    if (!Number.isFinite(offsetSec)) badRequest("bad x-offset-sec");
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) badRequest("empty body");
    const result = await ingestChunk(d, {
      manifestationId: m.id,
      runId,
      seq,
      offsetSec,
      mimeType,
      bytes,
    });
    after(() =>
      observe(d, m.id).catch((e) => console.error("observe failed", e)),
    );
    return result;
  });
}
