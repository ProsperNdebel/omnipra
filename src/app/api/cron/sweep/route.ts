import { runJobs, sweepAbandoned } from "@/pipeline";
import { getDeps } from "@/server/deps";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/sweep, every minute: ends sessions whose host's device went silent for
 * good, then runs due background jobs (briefings, plans, retries, webhook deliveries).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set, only
 * non production calls run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (
    secret ? auth !== `Bearer ${secret}` : process.env.NODE_ENV === "production"
  )
    return Response.json({ error: "Not allowed." }, { status: 401 });
  const d = getDeps();
  const ended = await sweepAbandoned(d);
  const jobs = await runJobs(d, { budgetMs: 240_000 });
  return Response.json({ ended, jobs });
}
