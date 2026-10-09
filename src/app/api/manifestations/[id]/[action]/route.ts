import type { ManifestationEvent, ManifestationId } from "@/core";
import { applyTransition, recordSession } from "@/pipeline";
import { drainSoon, queue } from "@/server/jobs";
import { authorizeTransition } from "@/services";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** "stop" is the host's emergency stop: an end, recorded as such. */
const ACTIONS = [
  "accept",
  "decline",
  "cancel",
  "start",
  "end",
  "stop",
] as const;
type Action = (typeof ACTIONS)[number];

/** POST /api/manifestations/:id/{accept|decline|cancel|start|end|stop} */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;
    if (!ACTIONS.includes(action as Action))
      badRequest(`unknown action ${action}`);
    const event: ManifestationEvent =
      action === "stop" ? "end" : (action as ManifestationEvent);

    const d = getDeps();
    const manifestationId = id as ManifestationId;
    const viewer = await viewerId();
    const ctx = await authorizeTransition(d, manifestationId, viewer, event);
    // Starting carries the host's confirmation that recording is allowed where they are.
    const body = (await req.json().catch(() => null)) as {
      captureConfirmed?: unknown;
    } | null;
    const manifestation = await applyTransition(d, manifestationId, event, {
      captureConfirmed: body?.captureConfirmed === true,
    });

    await recordSession(
      d,
      ctx,
      viewer,
      `session.${action as Action}`,
      action === "end" && ctx.isOwner && !ctx.isHost
        ? "Ended by the owner."
        : undefined,
    );

    // Arriving somewhere: meet the other agents already in the room.
    if (action === "start") await queue(d, "meet", { id: manifestationId });
    if (event === "end") await queue(d, "brief", { id: manifestationId });
    // Webhooks for this change.
    drainSoon(d, 0);
    return Response.json({ manifestation });
  } catch (err) {
    return errorResponse(err);
  }
}
