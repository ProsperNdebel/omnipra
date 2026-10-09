import type { Deps } from "@/pipeline";

/**
 * Is the marketplace working? Read straight from what happened: sessions, host
 * requests, nudges, the audit log. No tracking beyond the product's own records.
 */
export interface Metrics {
  since: string;
  sessions: number;
  bookings: {
    requested: number;
    accepted: number;
    declined: number;
    cancelled: number;
    /** Accepted out of those the host answered. */
    acceptance: number | null;
    /** Median minutes from request to the host accepting. */
    timeToHostMin: number | null;
  };
  completion: {
    /** Accepted sessions that went live. */
    started: number | null;
    /** Live sessions that reached a briefing. */
    briefed: number | null;
    emergencyStops: number;
    abandoned: number;
    /** Median minutes live. */
    medianLiveMin: number | null;
  };
  nudges: {
    total: number;
    perLiveSession: number | null;
    /** Nudges the owner answered within 5 minutes: the closest proxy for useful. */
    answered: number | null;
  };
  hostRequests: {
    sent: number;
    done: number;
    declined: number;
    /** Done out of those sent. */
    completion: number | null;
    medianAnswerMin: number | null;
  };
  money: {
    /** What owners agreed to pay hosts, in cents. */
    bookedCents: number;
    averageCents: number | null;
  };
  repeat: {
    owners: number;
    /** Owners who sent an agent more than once. */
    returning: number;
    /** The question that matters: did they send their agent somewhere again? */
    rate: number | null;
  };
  jobs: { queued: number; running: number; done: number; failed: number };
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const minutes = (from: string, to: string) =>
  (Date.parse(to) - Date.parse(from)) / 60_000;
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export async function metrics(d: Deps, days = 30): Promise<Metrics> {
  const since = new Date(Date.parse(d.now()) - days * 864e5).toISOString();
  const sessions = await d.repos.manifestations.contexts({
    createdAfter: since,
  });
  const ids = sessions.map((s) => s.manifestation.id);
  const [requests, messages, audit, jobs] = await Promise.all([
    d.repos.hostRequests.byManifestations(ids),
    d.repos.messages.byManifestations(ids),
    d.repos.audit.since(since, [
      "session.accept",
      "session.stop",
      "session.abandoned",
    ]),
    d.repos.jobs.counts(),
  ]);

  const status = (s: string) =>
    sessions.filter((c) => c.manifestation.status === s).length;
  const accepted = sessions.filter((c) =>
    ["accepted", "live", "ended", "briefed"].includes(c.manifestation.status),
  );
  const declined = status("declined");
  const went = sessions.filter((c) => c.manifestation.startedAt);
  const created = new Map(
    sessions.map((c) => [
      c.manifestation.id as string,
      c.manifestation.createdAt,
    ]),
  );
  const acceptWaits = audit
    .filter((e) => e.action === "session.accept" && created.has(e.subject.id))
    .map((e) => minutes(created.get(e.subject.id)!, e.at));

  const nudges = messages.filter((m) => m.kind === "nudge");
  const answered = nudges.filter((n) =>
    messages.some(
      (m) =>
        m.manifestationId === n.manifestationId &&
        m.from === "owner" &&
        m.createdAt > n.createdAt &&
        minutes(n.createdAt, m.createdAt) <= 5,
    ),
  );

  const sent = requests.filter((r) => r.sentAt);
  const done = sent.filter((r) => r.status === "done");
  const answers = sent
    .filter(
      (r) => r.resolvedAt && (r.status === "done" || r.status === "declined"),
    )
    .map((r) => minutes(r.sentAt!, r.resolvedAt!));

  const paid = accepted.map((c) => c.manifestation.priceCents);
  const byOwner = new Map<string, number>();
  for (const c of sessions)
    byOwner.set(c.agent.ownerId, (byOwner.get(c.agent.ownerId) ?? 0) + 1);
  const returning = [...byOwner.values()].filter((n) => n > 1).length;

  return {
    since,
    sessions: sessions.length,
    bookings: {
      requested: sessions.length,
      accepted: accepted.length,
      declined,
      cancelled: status("cancelled"),
      acceptance: ratio(accepted.length, accepted.length + declined),
      timeToHostMin: median(acceptWaits),
    },
    completion: {
      started: ratio(went.length, accepted.length),
      briefed: ratio(status("briefed"), went.length),
      emergencyStops: audit.filter((e) => e.action === "session.stop").length,
      abandoned: audit.filter((e) => e.action === "session.abandoned").length,
      medianLiveMin: median(
        went
          .filter((c) => c.manifestation.endedAt)
          .map((c) =>
            minutes(c.manifestation.startedAt!, c.manifestation.endedAt!),
          ),
      ),
    },
    nudges: {
      total: nudges.length,
      perLiveSession: ratio(nudges.length, went.length),
      answered: ratio(answered.length, nudges.length),
    },
    hostRequests: {
      sent: sent.length,
      done: done.length,
      declined: sent.filter((r) => r.status === "declined").length,
      completion: ratio(done.length, sent.length),
      medianAnswerMin: median(answers),
    },
    money: {
      bookedCents: paid.reduce((a, b) => a + b, 0),
      averageCents: paid.length
        ? Math.round(paid.reduce((a, b) => a + b, 0) / paid.length)
        : null,
    },
    repeat: {
      owners: byOwner.size,
      returning,
      rate: ratio(returning, byOwner.size),
    },
    jobs,
  };
}
