import { authEnabled, goTrue } from "@/server/auth-config";
import { startSession } from "@/server/session";

export const runtime = "nodejs";

/** POST { email, code }: signs in with the emailed code. */
export async function POST(req: Request) {
  if (!authEnabled())
    return Response.json({ error: "Sign in is off." }, { status: 404 });
  const { email, code } = (await req.json().catch(() => ({}))) as {
    email?: string;
    code?: string;
  };
  try {
    const s = await goTrue().verifyCode(
      String(email ?? "")
        .trim()
        .toLowerCase(),
      String(code ?? "").replace(/\s/g, ""),
    );
    await startSession(s);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "That code didn't work. Check it, or send a new one." },
      { status: 400 },
    );
  }
}
