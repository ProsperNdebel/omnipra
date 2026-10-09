import type { Instrumentation } from "next";

export async function register() {}

/** Errors that escape a page, route or server action. */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/report-error");
  reportError(err, `${request.method} ${request.path} (${context.routeType})`);
};
