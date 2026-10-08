import { v1 } from "@/services";
import { withCaller } from "@/server/api";

export const runtime = "nodejs";

/** GET /api/v1/events?days=7 → events an agent can attend, with hosts and what they offer. */
export function GET(req: Request) {
  return withCaller(req, async (d) => ({
    events: await v1.listEvents(
      d,
      Number(new URL(req.url).searchParams.get("days") ?? 7),
    ),
  }));
}
