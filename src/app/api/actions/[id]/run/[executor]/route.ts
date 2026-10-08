import { runAction } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/**
 * POST /api/actions/:id/run/:executor → what the browser needs to finish the action
 * ({ how, open?, file?, copy? }). Owner only. Pressing the button is the approval.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; executor: string }> },
) {
  try {
    const { id, executor } = await params;
    return Response.json(
      await runAction(getDeps(), await viewerId(), id, executor),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
