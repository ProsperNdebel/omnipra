import {
  DomainError,
  type HostRequestEvent,
  type HostRequestId,
  type ManifestationId,
} from "@/core";
import { actOnRequest } from "@/pipeline";
import { access } from "@/services";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

const EVENTS: HostRequestEvent[] = ["send", "dismiss", "done", "decline"];

/**
 * POST /api/manifestations/:id/requests/:rid/{send|dismiss|done|decline}
 * Owner: send (optionally with an edited { ask }) or dismiss. Host: done or decline,
 * optionally with { hostNote }.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; rid: string; event: string }> },
) {
  try {
    const { id, rid, event } = await params;
    if (!EVENTS.includes(event as HostRequestEvent))
      badRequest(`unknown action ${event}`);
    const body = (await req.json().catch(() => null)) as {
      ask?: unknown;
      hostNote?: unknown;
    } | null;

    const d = getDeps();
    const a = await access(d, id as ManifestationId, await viewerId());
    const request = await d.repos.hostRequests.get(rid as HostRequestId);
    if (!request || request.manifestationId !== a.manifestation.id) {
      throw new DomainError("not_found", "That request doesn't exist.");
    }
    const next = await actOnRequest(
      d,
      a,
      request,
      a,
      event as HostRequestEvent,
      {
        ask: typeof body?.ask === "string" ? body.ask : undefined,
        hostNote:
          typeof body?.hostNote === "string"
            ? body.hostNote.slice(0, 500)
            : undefined,
      },
    );
    return Response.json({
      request: a.isOwner
        ? next
        : {
            id: next.id,
            ask: next.ask,
            status: next.status,
            hostNote: next.hostNote,
          },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
