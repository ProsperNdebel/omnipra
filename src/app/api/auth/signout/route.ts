import { endSession } from "@/server/session";

export const runtime = "nodejs";

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
