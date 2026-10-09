import { NextResponse } from "next/server";
import { authEnabled, goTrue } from "@/server/auth-config";
import { safeNext, startSession } from "@/server/session";

export const runtime = "nodejs";

/**
 * GET /auth/confirm?token_hash=...&type=email&next=/agent: the link in the sign in
 * email, for templates that include one alongside the code.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const hash = url.searchParams.get("token_hash");
  const next = safeNext(url.searchParams.get("next"));
  if (authEnabled() && hash) {
    try {
      await startSession(
        await goTrue().verifyLink(
          hash,
          url.searchParams.get("type") ?? "email",
        ),
      );
      return NextResponse.redirect(new URL(next, url));
    } catch {
      // Fall through to the sign in page, which explains.
    }
  }
  return NextResponse.redirect(
    new URL(`/signin?expired=1&next=${encodeURIComponent(next)}`, url),
  );
}
