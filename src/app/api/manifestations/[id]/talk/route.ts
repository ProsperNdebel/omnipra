import { DomainError, type ManifestationId } from "@/core";
import { converse } from "@/pipeline";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { text }: the owner says something to their agent mid-session. Returns the new lines. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      text?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) badRequest("text is required");

    const d = getDeps();
    const a = await access(d, id as ManifestationId, await viewerId());
    if (!a.isOwner)
      throw new DomainError(
        "forbidden",
        "Only the agent's owner can talk to it.",
      );
    return Response.json({ messages: await converse(d, a, text) });
  } catch (err) {
    return errorResponse(err);
  }
}
