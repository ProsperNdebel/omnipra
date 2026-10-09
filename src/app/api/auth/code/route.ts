import { AuthError } from "@/adapters/auth/gotrue";
import { authEnabled, goTrue } from "@/server/auth-config";

export const runtime = "nodejs";

/** POST { email }: emails a sign in code. */
export async function POST(req: Request) {
  if (!authEnabled())
    return Response.json({ error: "Sign in is off." }, { status: 404 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const clean = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  try {
    await goTrue().sendCode(clean);
    return Response.json({ ok: true });
  } catch (e) {
    const status = e instanceof AuthError && e.status === 429 ? 429 : 502;
    return Response.json(
      {
        error:
          status === 429
            ? "Too many codes sent. Wait a minute and try again."
            : "Couldn't send the code. Try again.",
      },
      { status },
    );
  }
}
