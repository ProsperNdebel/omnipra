import { DomainError, type CapturePolicy, type EventId, type PresenceEvent } from "@/core";
import { importEvents } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { isAdmin } from "@/server/viewer";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLICIES: CapturePolicy[] = ["organizer", "public_talk", "none"];

/**
 * POST: a file of events (what the Tech Week reader produces) for when the server
 * can't reach the calendar itself. Admins only. Same ids update, never duplicate.
 */
export async function POST(req: Request) {
  try {
    if (!(await isAdmin()))
      throw new DomainError("forbidden", "Only admins can import events.");
    const body = (await req.json().catch(() => null)) as unknown;
    const list = Array.isArray(body)
      ? body
      : (body as { events?: unknown[] } | null)?.events;
    if (!Array.isArray(list) || list.length === 0)
      throw new DomainError("bad_request", "That file has no events in it.");
    if (list.length > 5000)
      throw new DomainError("bad_request", "That's more than 5000 events. Split the file.");
    const events: PresenceEvent[] = list.map((raw, i) => {
      const e = raw as Record<string, unknown>;
      const str = (k: string) => (typeof e[k] === "string" ? (e[k] as string).trim() : "");
      const ok =
        UUID.test(str("id")) &&
        str("title") &&
        !Number.isNaN(Date.parse(str("startsAt"))) &&
        !Number.isNaN(Date.parse(str("endsAt")));
      if (!ok) throw new DomainError("bad_request", `Event ${i + 1} is missing an id, title or times.`);
      return {
        id: str("id") as EventId,
        title: str("title").slice(0, 200),
        startsAt: new Date(str("startsAt")).toISOString(),
        endsAt: new Date(str("endsAt")).toISOString(),
        venue: str("venue") || null,
        sourceUrl: /^https:\/\//.test(str("sourceUrl")) ? str("sourceUrl") : null,
        capturePolicy: POLICIES.includes(e.capturePolicy as CapturePolicy)
          ? (e.capturePolicy as CapturePolicy)
          : "public_talk",
      };
    });
    return Response.json(await importEvents(getDeps(), events));
  } catch (err) {
    return errorResponse(err);
  }
}
