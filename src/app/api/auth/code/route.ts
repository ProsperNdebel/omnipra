import { AuthError } from "@/adapters/auth/gotrue";
import { authEnabled, goTrue } from "@/server/auth-config";
import { safeNext } from "@/server/session";

export const runtime = "nodejs";

/** POST { email, next? }: emails a sign in link (and code, if the template has one). */
export async function POST(req: Request) {
  if (!authEnabled())
    return Response.json({ error: "Sign in is off." }, { status: 404 });
  const { email, next } = (await req.json().catch(() => ({}))) as {
    email?: string;
    next?: string;
  };
  const clean = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  try {
    // The emailed link comes back to this site, then on to where they were going.
    const back = new URL("/auth/callback", req.url);
    back.searchParams.set("next", safeNext(next));
    await goTrue().sendCode(clean, back.toString());
    return Response.json({ ok: true });
  } catch (e) {
    const status = e instanceof AuthError && e.status === 429 ? 429 : 502;
    return Response.json(
      {
        error:
          status === 429
            ? "Too many sign in emails just now. Try again in a few minutes."
            : "Couldn't send the code. Try again.",
      },
      { status },
    );
  }
}
