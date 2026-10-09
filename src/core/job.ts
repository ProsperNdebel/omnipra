import type { ISODate } from "./ids";

/**
 * Work that must happen even if the request that started it dies: briefings, plans,
 * meeting other agents, webhook deliveries. Stored first, then run, retried with
 * backoff until it succeeds or runs out of attempts.
 */
export interface Job {
  id: string;
  kind: JobKind;
  /** At most one queued or running job per key, so enqueueing twice is harmless. */
  key: string;
  payload: Record<string, string>;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  maxAttempts: number;
  runAt: ISODate;
  /** While running: when another worker may take it over (the first one died). */
  lockedUntil: ISODate | null;
  lastError: string | null;
  createdAt: ISODate;
  finishedAt: ISODate | null;
}

export type JobKind = "brief" | "plan" | "meet" | "webhook";

/** 30 s, 1 min, 2 min, 4 min... capped at an hour. */
export function retryDelaySec(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

/** Webhook events an outside agent can subscribe to. */
export type WebhookEvent =
  | "ping"
  | "session.accepted"
  | "session.declined"
  | "session.cancelled"
  | "session.live"
  | "session.ended"
  | "session.briefed"
  | "nudge"
  | "request.accepted"
  | "request.done"
  | "request.declined";
