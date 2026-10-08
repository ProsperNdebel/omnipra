import {
  AUTONOMY,
  DomainError,
  type Autonomy,
  type ManifestationId,
} from "@/core";
import { setAutonomy } from "@/pipeline";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** POST { autonomy: "ask_first" | "act" }: how much the agent may do on its own here. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      autonomy?: unknown;
    } | null;
    const autonomy = body?.autonomy as Autonomy;
    if (!AUTONOMY.includes(autonomy))
      badRequest("autonomy must be ask_first or act");

    const d = getDeps();
    const a = await access(d, id as ManifestationId, await viewerId());
    if (!a.isOwner)
      throw new DomainError(
        "forbidden",
        "Only the agent's owner can change this.",
      );
    await setAutonomy(d, a, autonomy);
    return Response.json({ autonomy });
  } catch (err) {
    return errorResponse(err);
  }
}
