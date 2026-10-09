import { runJobs, sweepAbandoned } from "@/pipeline";
import { getDeps } from "@/server/deps";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/sweep, every minute: ends sessions whose host's device went silent for
 * good, then runs due background jobs (briefings, plans, retries, webhook deliveries).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; other schedulers can pass
 * ?secret=. Without CRON_SECRET set, only non production calls run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // The header for Vercel; ?secret= for outside schedulers that can't set headers.
  const given =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(req.url).searchParams.get("secret");
  if (secret ? given !== secret : process.env.NODE_ENV === "production")
    return Response.json({ error: "Not allowed." }, { status: 401 });
  const d = getDeps();
  const ended = await sweepAbandoned(d);
  const jobs = await runJobs(d, { budgetMs: 240_000 });
  return Response.json({ ended, jobs });
}
