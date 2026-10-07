import { after } from "next/server";
import type { ManifestationEvent, ManifestationId } from "@/core";
import { applyTransition, brief } from "@/pipeline";
import { authorizeTransition } from "@/services";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

const ACTIONS: ManifestationEvent[] = ["accept", "decline", "cancel", "start", "end"];

/** POST /api/manifestations/:id/{accept|decline|cancel|start|end} */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  try {
    const { id, action } = await params;
    if (!ACTIONS.includes(action as ManifestationEvent)) badRequest(`unknown action ${action}`);

    const d = getDeps();
    const manifestationId = id as ManifestationId;
    await authorizeTransition(d, manifestationId, await viewerId(), action as ManifestationEvent);
    const manifestation = await applyTransition(d, manifestationId, action as ManifestationEvent);

    if (action === "end") {
      after(() => brief(d, manifestationId).catch((e) => console.error("brief failed", e)));
    }
    return Response.json({ manifestation });
  } catch (err) {
    return errorResponse(err);
  }
}
