import { after } from "next/server";
import { DomainError, type ManifestationId } from "@/core";
import { ingestChunk, observe } from "@/pipeline";
import { access } from "@/services";
import { viewerId } from "@/server/viewer";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";

export const runtime = "nodejs";

/**
 * Raw audio body; chunk position in headers. Kept as a plain body instead of multipart
 * so the client sends exactly the bytes it stored, with no encoding step that can fail.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const runId = req.headers.get("x-run-id") ?? badRequest("missing x-run-id");
    const seq = Number(req.headers.get("x-seq"));
    const offsetSec = Number(req.headers.get("x-offset-sec"));
    const mimeType = req.headers.get("content-type") ?? badRequest("missing content-type");
    if (!Number.isInteger(seq) || seq < 0) badRequest("bad x-seq");
    if (!Number.isFinite(offsetSec)) badRequest("bad x-offset-sec");

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) badRequest("empty body");

    const d = getDeps();
    const manifestationId = id as ManifestationId;
    if (!(await access(d, manifestationId, await viewerId())).isHost) {
      throw new DomainError("forbidden", "Only the host's device can send audio.");
    }
    const result = await ingestChunk(d, { manifestationId, runId, seq, offsetSec, mimeType, bytes });

    // Respond as soon as the chunk is safe; the agent thinks after the response is sent.
    after(() => observe(d, manifestationId).catch((e) => console.error("observe failed", e)));
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
