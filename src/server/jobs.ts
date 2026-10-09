import { after } from "next/server";
import { enqueue, runJobs, type Deps } from "@/pipeline";
import type { JobKind } from "@/core";

/**
 * Queue work and start it as soon as this response is sent. If the process dies first,
 * the job is still stored and the scheduler (or the next kick) runs it.
 */
export async function queue(
  d: Deps,
  kind: JobKind,
  payload: Record<string, string>,
): Promise<void> {
  const id = await enqueue(d, kind, payload);
  if (id)
    after(() =>
      runJobs(d, { id }).catch((e) => console.error("job failed", e)),
    );
}

let lastDrain = 0;

/**
 * Run whatever is due (retries, webhook deliveries) after this response, at most every
 * few seconds per process. The fallback when no scheduler is set up.
 */
export function drainSoon(d: Deps, everyMs = 10_000): void {
  if (Date.now() - lastDrain < everyMs) return;
  lastDrain = Date.now();
  after(() =>
    runJobs(d, { budgetMs: 20_000 }).catch((e) =>
      console.error("drain failed", e),
    ),
  );
}
