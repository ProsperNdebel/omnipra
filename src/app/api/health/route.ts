import { authEnabled } from "@/server/auth-config";
import { getDeps } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health: is this deployment set up right? For uptime checks and for the
 * first look after deploying. Says what's missing, never the values of secrets.
 */
export async function GET() {
  const env = (k: string) => !!process.env[k];
  const supabase =
    env("NEXT_PUBLIC_SUPABASE_URL") && env("SUPABASE_SECRET_KEY");
  const fake = process.env.PRESENCE_FAKE_AI === "1";
  const problems: string[] = [];

  let missingMigrations: string[] = [];
  let database = "ok";
  try {
    missingMigrations = await getDeps().repos.system.missingMigrations();
  } catch (e) {
    database = e instanceof Error ? e.message : "unreachable";
    problems.push("The database can't be reached.");
  }
  if (missingMigrations.length)
    problems.push(`Run these migrations: ${missingMigrations.join(", ")}.`);
  if (!supabase)
    problems.push(
      "Supabase isn't configured; data lives in memory and is lost on restart.",
    );
  if (!fake && !env("ANTHROPIC_API_KEY"))
    problems.push("ANTHROPIC_API_KEY is missing.");
  if (!fake && !env("DEEPGRAM_API_KEY"))
    problems.push("DEEPGRAM_API_KEY is missing.");
  if (fake) problems.push("PRESENCE_FAKE_AI=1: the agent is canned, not real.");
  if (process.env.NODE_ENV === "production") {
    if (!authEnabled())
      problems.push(
        "Sign in is off (OMNIPRA_AUTH=1): anyone gets an anonymous identity.",
      );
    if (!env("CRON_SECRET"))
      problems.push("CRON_SECRET is missing, so the scheduler can't run.");
  }

  const ok =
    database === "ok" && missingMigrations.length === 0 && supabase && !fake;
  return Response.json(
    {
      ok,
      store: supabase ? "supabase" : "memory",
      database,
      missing_migrations: missingMigrations,
      ai: fake ? "fake" : "real",
      auth: authEnabled(),
      problems,
    },
    {
      status: database === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
