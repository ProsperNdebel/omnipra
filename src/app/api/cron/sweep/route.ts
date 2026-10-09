import { sweepAbandoned } from "@/pipeline";
import { getDeps } from "@/server/deps";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/sweep: ends sessions whose host's device went silent for good and
 * briefs them. Called by the scheduler (vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set, only local calls run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (
    secret ? auth !== `Bearer ${secret}` : process.env.NODE_ENV === "production"
  )
    return Response.json({ error: "Not allowed." }, { status: 401 });
  const ended = await sweepAbandoned(getDeps());
  return Response.json({ ended });
}
