import { v1 } from "@/services";
import { withCaller } from "@/server/api";

export const runtime = "nodejs";

/** GET /api/v1/manifestations/:id → status, event, host and plan. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withCaller(req, async (d, caller) => ({
    manifestation: await v1.session(d, caller, id),
  }));
}
