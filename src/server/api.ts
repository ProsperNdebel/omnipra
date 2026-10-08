import { authenticate, type v1 } from "@/services";
import type { Deps } from "@/pipeline";
import { getDeps } from "./deps";
import { errorResponse } from "./http";

/** Every v1 handler: authenticate the bearer key, run, and map errors the same way. */
export async function withCaller(
  req: Request,
  run: (d: Deps, caller: v1.Caller) => Promise<unknown>,
): Promise<Response> {
  try {
    const d = getDeps();
    const { agent } = await authenticate(d, req.headers.get("authorization"));
    const out = await run(d, { agent });
    return Response.json(out ?? null);
  } catch (err) {
    return errorResponse(err);
  }
}
