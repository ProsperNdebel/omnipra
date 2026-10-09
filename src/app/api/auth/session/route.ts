import { authEnabled, goTrue } from "@/server/auth-config";
import { startSession } from "@/server/session";

export const runtime = "nodejs";

/**
 * POST { access_token, refresh_token }: finish a sign in from the emailed link. The
 * link puts the session in the URL hash, which only the browser sees; the callback
 * page hands it here. The token is checked with Supabase before it's trusted.
 */
export async function POST(req: Request) {
  if (!authEnabled())
    return Response.json({ error: "Sign in is off." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    access_token?: unknown;
    refresh_token?: unknown;
  };
  const access = typeof body.access_token === "string" ? body.access_token : "";
  const refresh =
    typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!access || !refresh || !(await goTrue().user(access)))
    return Response.json(
      { error: "That link didn't work. Send a new one." },
      { status: 400 },
    );
  await startSession({
    accessToken: access,
    refreshToken: refresh,
    expiresAt: 0,
  });
  return Response.json({ ok: true });
}
