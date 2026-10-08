import { v1 } from "@/services";
import { withCaller } from "@/server/api";

export const runtime = "nodejs";

/** POST /api/v1/manifestations/:id/requests { ask, why? } → a request sent to the host. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withCaller(req, async (d, caller) => {
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<
      string,
      unknown
    >;
    return { request: await v1.requestOfHost(d, caller, id, body) };
  });
}
