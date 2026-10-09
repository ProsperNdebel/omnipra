import {
  retryDelaySec,
  type Job,
  type JobKind,
  type MissionId,
  type ManifestationId,
} from "@/core";
import { brief } from "./brief";
import type { Deps } from "./deps";
import { meetOthers } from "./meet";
import { draftPlan } from "./plan";
import { settle } from "./payments";
import { deliver } from "./webhooks";

const HANDLERS: Record<
  JobKind,
  (d: Deps, p: Record<string, string>) => Promise<unknown>
> = {
  brief: (d, p) => brief(d, p.id as ManifestationId),
  plan: (d, p) => draftPlan(d, p.missionId as MissionId),
  meet: (d, p) => meetOthers(d, p.id as ManifestationId),
  webhook: (d, p) => deliver(d, p.keyId!, p.body!),
  settle: (d, p) => settle(d, p.id as ManifestationId),
};

/** How long a worker holds a job before another may assume it died. */
const LEASE_SEC = 5 * 60;

/**
 * Run due jobs until none are left or the time budget is spent. Safe to call from
 * many places at once: each job is claimed by exactly one caller. With `id`, runs just
 * that job (the route that queued it kicking it straight away).
 */
export async function runJobs(
  d: Deps,
  opts: { id?: string; budgetMs?: number; batch?: number } = {},
): Promise<{ done: number; retrying: number; failed: number }> {
  const started = Date.now();
  const tally = { done: 0, retrying: 0, failed: 0 };
  while (Date.now() - started < (opts.budgetMs ?? 60_000)) {
    const now = d.now();
    const lease = new Date(Date.parse(now) + LEASE_SEC * 1000).toISOString();
    const jobs = await d.repos.jobs.claim(now, opts.batch ?? 5, lease, opts.id);
    if (jobs.length === 0) break;
    await Promise.all(jobs.map((j) => runOne(d, j, tally)));
    if (opts.id) break;
  }
  return tally;
}

async function runOne(
  d: Deps,
  j: Job,
  tally: { done: number; retrying: number; failed: number },
) {
  try {
    await HANDLERS[j.kind](d, j.payload);
    await d.repos.jobs.finish(j.id, {
      status: "done",
      runAt: j.runAt,
      lastError: null,
      finishedAt: d.now(),
    });
    tally.done++;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const last = j.attempts >= j.maxAttempts;
    console.error(
      `job ${j.kind} ${j.id} attempt ${j.attempts} failed`,
      message,
    );
    await d.repos.jobs.finish(j.id, {
      status: last ? "failed" : "queued",
      runAt: new Date(
        Date.parse(d.now()) + retryDelaySec(j.attempts) * 1000,
      ).toISOString(),
      lastError: message.slice(0, 500),
      finishedAt: last ? d.now() : null,
    });
    if (last) tally.failed++;
    else tally.retrying++;
  }
}
