import { createApiKey } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** POST { label } → a new key for this agent. The secret is in this response only. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      label?: unknown;
    } | null;
    const { key, secret } = await createApiKey(
      getDeps(),
      await viewerId(),
      id,
      typeof body?.label === "string" ? body.label : "",
    );
    return Response.json({ id: key.id, prefix: key.prefix, secret });
  } catch (err) {
    return errorResponse(err);
  }
}
