import {
  DomainError,
  type Capability,
  type Agent,
  type EventId,
  type ManifestationId,
  type MissionId,
  type UserId,
} from "@/core";
import { fileAsks, type Deps } from "@/pipeline";
import { access } from "./access";
import { sendAgent } from "./missions";

/**
 * Presence as infrastructure: what an outside agent can do through the API. Every call
 * acts as one Presence agent, with exactly its owner's rights over it.
 * Responses use snake_case, as most HTTP APIs do.
 */
export interface Caller {
  agent: Agent;
}

const MAX_DAYS = 30;

/** Capability names in the API, which describe what an agent gets rather than the hardware. */
const API_NAME: Partial<Record<Capability, string>> = {
  mic: "audio",
  camera: "vision",
  speaker: "speech",
  location: "location",
};
const FROM_API = Object.fromEntries(
  Object.entries(API_NAME).map(([k, v]) => [v, k as Capability]),
);

/** Events an agent could attend, with the hosts who could carry it and what they offer. */
export async function listEvents(d: Deps, days = 7) {
  const now = new Date(d.now());
  const to = new Date(
    now.getTime() + Math.min(Math.max(days, 1), MAX_DAYS) * 864e5,
  );
  const events = (
    await d.repos.events.list({ from: now.toISOString(), to: to.toISOString() })
  ).filter((e) => e.capturePolicy !== "none");
  const listings = await d.repos.events.listingsFor(events.map((e) => e.id));
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    venue: e.venue,
    capture_policy: e.capturePolicy,
    hosts: listings
      .filter((l) => l.eventId === e.id)
      .map((l) => ({
        id: l.hostId,
        name: l.displayName,
        price_cents: l.priceCents,
        capabilities: [
          ...l.offers.flatMap((c) => (API_NAME[c] ? [API_NAME[c]] : [])),
          ...(l.openToRequests ? ["host_requests"] : []),
        ],
      })),
  }));
}

/**
 * Manifest at an event. With no host named, Presence picks the cheapest host offering
 * every capability asked for, within budget. Returns the session and its mission, so
 * the caller's plan can be drafted.
 */
export async function manifest(
  d: Deps,
  caller: Caller,
  body: {
    event_id?: unknown;
    host_id?: unknown;
    instructions?: unknown;
    budget_cents?: unknown;
    capabilities?: unknown;
    autonomy?: unknown;
  },
): Promise<{ session: ReturnType<typeof sessionJson>; missionId: MissionId }> {
  const eventId = String(body.event_id ?? "") as EventId;
  if (!eventId) throw new DomainError("bad_request", "event_id is required.");
  const wants = (
    Array.isArray(body.capabilities) ? body.capabilities : ["audio"]
  ).map(String);
  const budget =
    body.budget_cents === undefined ? Infinity : Number(body.budget_cents);
  if (!(budget >= 0))
    throw new DomainError("bad_request", "budget_cents must be a number.");

  const listings = await d.repos.events.listings(eventId);
  const requires = wants.flatMap((w) => (FROM_API[w] ? [FROM_API[w]!] : []));
  const fits = listings
    .filter((l) => (body.host_id ? l.hostId === body.host_id : true))
    .filter((l) => requires.every((c) => l.offers.includes(c)))
    .filter((l) => (wants.includes("host_requests") ? l.openToRequests : true))
    .filter((l) => l.priceCents <= budget)
    .sort((a, b) => a.priceCents - b.priceCents);
  const host = fits[0];
  if (!host)
    throw new DomainError(
      "not_found",
      "No host at that event offers what you asked for within budget.",
    );

  const m = await sendAgent(d, {
    ownerId: caller.agent.ownerId,
    agentId: caller.agent.id,
    eventId,
    hostId: host.hostId,
    instructions: String(body.instructions ?? "").slice(0, 2000),
    alerts: [],
    autonomy: body.autonomy === "act" ? "act" : "ask_first",
    requires: requires.length ? requires : ["mic"],
  });
  return { session: await session(d, caller, m.id), missionId: m.missionId };
}

async function own(d: Deps, caller: Caller, id: string) {
  const a = await access(
    d,
    id as ManifestationId,
    caller.agent.ownerId as UserId,
  ).catch(() => null);
  if (!a || a.agent.id !== caller.agent.id)
    throw new DomainError("not_found", "No such session for this agent.");
  return a;
}

function sessionJson(
  a: Awaited<ReturnType<typeof own>>,
  hostName: string | null,
) {
  return {
    id: a.manifestation.id,
    status: a.manifestation.status,
    event: {
      id: a.event.id,
      title: a.event.title,
      starts_at: a.event.startsAt,
    },
    host: hostName,
    started_at: a.manifestation.startedAt,
    ended_at: a.manifestation.endedAt,
    autonomy: a.mission.autonomy,
    plan: (a.mission.plan ?? []).map((p) => ({
      id: p.id,
      goal: p.goal,
      watch_for: p.watchFor,
    })),
  };
}

export async function session(d: Deps, caller: Caller, id: string) {
  const a = await own(d, caller, id);
  const listing = (await d.repos.events.listingsFor([a.event.id])).find(
    (l) => l.hostId === a.endpoint.hostId,
  );
  return sessionJson(a, listing?.displayName ?? null);
}

/**
 * Everything new since the caller's cursor: raw transcript after `after_sec`, and notes,
 * messages and requests changed after `since`. Feed the returned cursor back in.
 */
export async function stream(
  d: Deps,
  caller: Caller,
  id: string,
  cursor: { afterSec: number; since: string },
) {
  const a = await own(d, caller, id);
  const mid = a.manifestation.id;
  const [segments, notes, messages, requests, briefing] = await Promise.all([
    d.repos.segments.since(mid, cursor.afterSec),
    d.repos.observations.byManifestation(mid),
    d.repos.messages.byManifestation(mid),
    d.repos.hostRequests.byManifestation(mid),
    d.repos.briefings.get(mid),
  ]);
  const newer = (t: string | null) => !!t && t > cursor.since;
  const now = d.now();
  return {
    status: a.manifestation.status,
    transcript: segments.map((s) => ({
      id: s.id,
      start_sec: s.startSec,
      end_sec: s.endSec,
      speaker: s.speaker,
      text: s.text,
    })),
    notes: notes
      .filter((n) => newer(n.createdAt))
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        text: n.text,
        basis: n.basis,
        speaker: n.speaker,
        importance: n.importance,
        at_sec: n.atSec,
        evidence: n.evidence,
        from_host: n.hostRequestId !== null,
      })),
    messages: messages
      .filter((m) => newer(m.createdAt))
      .map((m) => ({
        from: m.from,
        kind: m.kind,
        text: m.text,
        at: m.createdAt,
      })),
    requests: requests
      .filter(
        (r) => newer(r.resolvedAt) || newer(r.sentAt) || newer(r.createdAt),
      )
      .map((r) => ({
        id: r.id,
        ask: r.ask,
        status: r.status,
        host_note: r.hostNote,
      })),
    briefing:
      briefing && newer(briefing.createdAt)
        ? { markdown: briefing.markdown, headline: briefing.headline }
        : null,
    cursor: {
      after_sec: segments.length
        ? Math.max(...segments.map((s) => s.endSec))
        : cursor.afterSec,
      since: now,
    },
  };
}

/** Ask the host to do something in the room. Goes straight to them: the caller is the owner. */
export async function requestOfHost(
  d: Deps,
  caller: Caller,
  id: string,
  body: { ask?: unknown; why?: unknown },
) {
  const a = await own(d, caller, id);
  const ask = String(body.ask ?? "")
    .trim()
    .slice(0, 300);
  if (!ask) throw new DomainError("bad_request", "ask is required.");
  if (
    a.manifestation.status !== "accepted" &&
    a.manifestation.status !== "live"
  )
    throw new DomainError("bad_request", "The session isn't active.");
  const listing = (await d.repos.events.listingsFor([a.event.id])).find(
    (l) => l.hostId === a.endpoint.hostId,
  );
  if (!listing?.openToRequests)
    throw new DomainError("bad_request", "This host doesn't take requests.");
  const { requests } = await fileAsks(
    d,
    a,
    [{ ask, why: String(body.why ?? "").slice(0, 300) }],
    { origin: "owner", hostTakesRequests: true },
  );
  const r = requests[0];
  if (!r) throw new DomainError("conflict", "That ask already exists.");
  return { id: r.id, ask: r.ask, status: r.status };
}
