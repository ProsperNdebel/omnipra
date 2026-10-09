import type { Job, JobKind } from "@/core";
import type { Deps } from "./deps";

/**
 * Store work to be done, then return. Something else runs it (see runJobs): right
 * after the request when the route kicks it, else the scheduler, retrying on failure.
 * Returns the job id, or null when the same work is already waiting.
 */
export async function enqueue(
  d: Deps,
  kind: JobKind,
  payload: Record<string, string>,
  opts: { key?: string; delaySec?: number; maxAttempts?: number } = {},
): Promise<string | null> {
  const now = Date.parse(d.now());
  const job: Job = {
    id: d.newId(),
    kind,
    key: opts.key ?? `${kind}:${Object.values(payload).join(":")}`,
    payload,
    status: "queued",
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 5,
    runAt: new Date(now + (opts.delaySec ?? 0) * 1000).toISOString(),
    lockedUntil: null,
    lastError: null,
    createdAt: d.now(),
    finishedAt: null,
  };
  return (await d.repos.jobs.enqueue(job)) ? job.id : null;
}
