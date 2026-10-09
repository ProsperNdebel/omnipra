import { NextResponse } from "next/server";
import { payoutSetupUrl } from "@/services";
import { getDeps } from "@/server/deps";
import { siteOrigin } from "@/server/origin";
import { viewerEmail, viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** GET: send the host to the payment provider to set up payouts. */
export async function GET() {
  const origin = await siteOrigin();
  try {
    const url = await payoutSetupUrl(
      getDeps(),
      await viewerId(),
      await viewerEmail(),
      origin,
    );
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't start payout setup.";
    return NextResponse.redirect(
      `${origin}/host?error=${encodeURIComponent(msg)}`,
    );
  }
}
