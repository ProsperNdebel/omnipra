import type {
  Capability,
  Agent,
  AgentId,
  AgentMessage,
  Autonomy,
  HostRequest,
  Manifestation,
  Observation,
  PlanItem,
  PresenceEvent,
  SessionContext,
  StoredBriefing,
  UserId,
} from "@/core";
import type { Deps } from "@/pipeline";
import { silentForSec } from "@/core";
import { awaitingPayment } from "./payments";

/**
 * Read models for screens. Composed from ports; no business rules live here.
 * Each screen costs a fixed number of round trips, however many sessions it shows.
 */

export interface ManifestationRow {
  manifestation: Manifestation;
  event: PresenceEvent;
  agentId: AgentId;
  agentName: string;
  hostName: string | null;
  instructions: string;
  /** The sensors this session uses on the host's device. */
  requires: Capability[];
  observations: number;
  important: number;
  /** Most recent note, by when it was said. Owner views only; hosts never get content. */
  latest: Observation | null;
}

/** Turn joined sessions into rows: two more round trips total, not per session. */
async function rows(
  d: Deps,
  contexts: SessionContext[],
  opts: { withContent: boolean },
): Promise<ManifestationRow[]> {
  const ids = contexts.map((c) => c.manifestation.id);
  const eventIds = [...new Set(contexts.map((c) => c.event.id))];
  const [notes, listings] = await Promise.all([
    opts.withContent ? d.repos.observations.byManifestations(ids) : [],
    d.repos.events.listingsFor(eventIds),
  ]);

  const notesBySession = new Map<string, Observation[]>();
  for (const o of notes) {
    const list = notesBySession.get(o.manifestationId) ?? [];
    list.push(o);
    notesBySession.set(o.manifestationId, list);
  }
  const hostName = new Map(
    listings.map((l) => [`${l.eventId}:${l.hostId}`, l.displayName]),
  );

  return contexts.map((c) => {
    const mine = notesBySession.get(c.manifestation.id) ?? [];
    return {
      manifestation: c.manifestation,
      event: c.event,
      agentId: c.agent.id,
      agentName: c.agent.name,
      hostName: hostName.get(`${c.event.id}:${c.endpoint.hostId}`) ?? null,
      instructions: c.mission.instructions,
      requires: c.mission.requires,
      observations: mine.length,
      important: mine.filter((o) => o.importance === 3).length,
      latest: opts.withContent ? latestSaid(mine) : null,
    };
  });
}

function latestSaid(observations: Observation[]): Observation | null {
  let best: Observation | null = null;
  for (const o of observations) {
    if (!best || (o.atSec ?? -1) > (best.atSec ?? -1)) best = o;
  }
  return best;
}

export async function agentHome(
  d: Deps,
  agent: Agent,
): Promise<ManifestationRow[]> {
  const contexts = await d.repos.manifestations.contexts({
    agentIds: [agent.id],
  });
  return rows(d, contexts, { withContent: true });
}

export interface OwnerOverview {
  /** Every live session across all agents, oldest start first: the multi-presence view. */
  live: ManifestationRow[];
  /** Per agent: sessions live now and sessions in total. */
  counts: Map<string, { live: number; total: number }>;
  /** Latest interruptions from every room at once, newest first. */
  nudges: {
    message: AgentMessage;
    eventTitle: string;
    agentName: string;
    sessionId: string;
  }[];
}

/** How many recent nudges the combined stream shows. */
const STREAM = 8;

/** Everything the agents page needs, for all agents at once. */
export async function ownerOverview(
  d: Deps,
  agents: Agent[],
): Promise<OwnerOverview> {
  const contexts = await d.repos.manifestations.contexts({
    agentIds: agents.map((a) => a.id),
  });
  const counts = new Map(
    agents.map((a) => [a.id as string, { live: 0, total: 0 }]),
  );
  for (const c of contexts) {
    const n = counts.get(c.agent.id)!;
    n.total++;
    if (c.manifestation.status === "live") n.live++;
  }
  const liveContexts = contexts.filter(
    (c) => c.manifestation.status === "live",
  );
  const [liveRows, liveMessages] = await Promise.all([
    rows(d, liveContexts, { withContent: true }),
    d.repos.messages.byManifestations(
      liveContexts.map((c) => c.manifestation.id),
    ),
  ]);
  const live = liveRows.sort((a, b) =>
    (a.manifestation.startedAt ?? "").localeCompare(
      b.manifestation.startedAt ?? "",
    ),
  );
  const byId = new Map(
    liveContexts.map((c) => [c.manifestation.id as string, c]),
  );
  const nudges = liveMessages
    .filter((m) => m.kind === "nudge")
    .slice(-STREAM)
    .reverse()
    .map((message) => {
      const c = byId.get(message.manifestationId)!;
      return {
        message,
        eventTitle: c.event.title,
        agentName: c.agent.name,
        sessionId: c.manifestation.id,
      };
    });
  return { live, counts, nudges };
}

export async function hostInbox(
  d: Deps,
  hostId: UserId,
): Promise<ManifestationRow[]> {
  const endpoints = await d.repos.endpoints.byHost(hostId);
  const contexts = await d.repos.manifestations.contexts({
    endpointIds: endpoints.map((e) => e.id),
  });
  // Paid bookings reach the host once the owner's card is held.
  const unpaid = await awaitingPayment(d, contexts);
  return rows(
    d,
    contexts.filter((c) => !unpaid.has(c.manifestation.id)),
    { withContent: false },
  );
}

/** The host's display name for a session, from the event's listings. */
export async function hostNameFor(
  d: Deps,
  c: SessionContext,
): Promise<string | null> {
  const listings = await d.repos.events.listingsFor([c.event.id]);
  return (
    listings.find((l) => l.hostId === c.endpoint.hostId)?.displayName ?? null
  );
}

/** A request as the host sees it: what to do, never why the owner wants it. */
export interface HostRequestView {
  id: string;
  ask: string;
  status: HostRequest["status"];
  hostNote: string | null;
}

/** What a live view polls. Hosts get counts and their requests; the intelligence belongs to the owner. */
export interface Feed {
  status: Manifestation["status"];
  startedAt: string | null;
  endedAt: string | null;
  observationCount: number;
  observations: Observation[] | null;
  briefing: StoredBriefing | null;
  /** Owner only: nudges, chat and updates, oldest first. */
  messages: AgentMessage[] | null;
  /** Owner: every request with its why. Host: only ones sent to them, without the why. */
  requests: HostRequest[] | HostRequestView[];
  autonomy: Autonomy;
  hostTakesRequests: boolean;
  /** Owner only. Null until drafted. */
  plan: PlanItem[] | null;
  /** Seconds since the host's device last sent anything. Null unless live. */
  silentSec: number | null;
}

export async function feed(
  d: Deps,
  ctx: SessionContext,
  asOwner: boolean,
): Promise<Feed> {
  const id = ctx.manifestation.id;
  const [observations, briefing, messages, requests, listings] =
    await Promise.all([
      d.repos.observations.byManifestation(id),
      asOwner ? d.repos.briefings.get(id) : null,
      asOwner ? d.repos.messages.byManifestation(id) : null,
      d.repos.hostRequests.byManifestation(id),
      d.repos.events.listingsFor([ctx.event.id]),
    ]);
  const m = ctx.manifestation;
  return {
    status: m.status,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    observationCount: observations.length,
    observations: asOwner ? observations : null,
    briefing,
    messages,
    requests: asOwner
      ? requests
      : requests
          .filter((r) => r.status !== "proposed" && r.status !== "dismissed")
          .map((r) => ({
            id: r.id,
            ask: r.ask,
            status: r.status,
            hostNote: r.hostNote,
          })),
    autonomy: ctx.mission.autonomy,
    plan: asOwner ? ctx.mission.plan : null,
    hostTakesRequests:
      listings.find((l) => l.hostId === ctx.endpoint.hostId)?.openToRequests ??
      false,
    silentSec: silentForSec(m, d.now()),
  };
}
