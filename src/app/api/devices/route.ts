import { registerDevice } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** POST { name, kind, capabilities } → a new body for this host. The token is in this response only. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      kind?: unknown;
      capabilities?: unknown;
    } | null;
    const { device, token } = await registerDevice(
      getDeps(),
      await viewerId(),
      {
        name: String(body?.name ?? ""),
        kind: String(body?.kind ?? ""),
        capabilities: Array.isArray(body?.capabilities)
          ? body.capabilities.map(String)
          : [],
      },
    );
    return Response.json({ id: device.id, token });
  } catch (err) {
    return errorResponse(err);
  }
}
