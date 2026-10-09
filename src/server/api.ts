import { authenticate, authenticateDevice, type v1 } from "@/services";
import type { Endpoint } from "@/core";
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
    const caller = await authenticate(d, req.headers.get("authorization"));
    const out = await run(d, caller);
    return Response.json(out ?? null);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Every device API handler: authenticate the device token, run, map errors. */
export async function withDevice(
  req: Request,
  run: (d: Deps, device: Endpoint) => Promise<unknown>,
): Promise<Response> {
  try {
    const d = getDeps();
    const device = await authenticateDevice(
      d,
      req.headers.get("authorization"),
    );
    return Response.json((await run(d, device)) ?? null);
  } catch (err) {
    return errorResponse(err);
  }
}
