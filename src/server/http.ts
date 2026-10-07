import { DomainError } from "@/core";

/**
 * Domain errors to HTTP. The capture uploader treats 4xx as permanent (drop the chunk)
 * and 5xx as retryable, so this mapping is part of the client contract.
 */
const STATUS: Record<string, number> = {
  not_found: 404,
  not_capturing: 410,
  not_started: 425,
  forbidden: 403,
  invalid_transition: 409,
  conflict: 409,
  bad_request: 400,
};

export function errorResponse(err: unknown): Response {
  if (err instanceof DomainError) {
    return Response.json({ error: err.code, message: err.message }, { status: STATUS[err.code] ?? 400 });
  }
  console.error(err);
  return Response.json({ error: "internal" }, { status: 500 });
}

export function badRequest(message: string): never {
  throw new DomainError("bad_request", message);
}
