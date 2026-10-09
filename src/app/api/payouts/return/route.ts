import { NextResponse } from "next/server";
import { payoutState } from "@/services";
import { getDeps } from "@/server/deps";
import { siteOrigin } from "@/server/origin";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** GET: back from payout setup. Check it with the provider, then back to Hosting. */
export async function GET() {
  const origin = await siteOrigin();
  const state = await payoutState(getDeps(), await viewerId()).catch(
    () => "pending" as const,
  );
  return NextResponse.redirect(`${origin}/host?payouts=${state}#payouts`);
}
