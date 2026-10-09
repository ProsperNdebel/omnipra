import { badges } from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** GET: counts for the nav badges. Zeros for anyone signed out. */
export async function GET() {
  const me = await viewerId().catch(() => null);
  const counts = me
    ? await badges(getDeps(), me).catch(() => ({ agents: 0, hosting: 0 }))
    : { agents: 0, hosting: 0 };
  return Response.json(counts, { headers: { "cache-control": "no-store" } });
}
