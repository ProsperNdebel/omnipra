import type {
  Agent,
  AgentId,
  Manifestation,
  ManifestationId,
  Observation,
  PresenceEvent,
  SessionContext,
  StoredBriefing,
  UserId,
} from "@/core";
import type { Deps } from "@/pipeline";

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
}

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
  const live = (await rows(d, liveContexts, { withContent: true })).sort(
    (a, b) =>
      (a.manifestation.startedAt ?? "").localeCompare(
        b.manifestation.startedAt ?? "",
      ),
  );
  return { live, counts };
}

export async function hostInbox(
  d: Deps,
  hostId: UserId,
): Promise<ManifestationRow[]> {
  const endpoints = await d.repos.endpoints.byHost(hostId);
  const contexts = await d.repos.manifestations.contexts({
    endpointIds: endpoints.map((e) => e.id),
  });
  return rows(d, contexts, { withContent: false });
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

export interface Feed {
  status: Manifestation["status"];
  startedAt: string | null;
  endedAt: string | null;
  observationCount: number;
  observations: Observation[] | null;
  briefing: StoredBriefing | null;
}

export async function feed(
  d: Deps,
  id: ManifestationId,
  asOwner: boolean,
): Promise<Feed> {
  const [m, observations, briefing] = await Promise.all([
    d.repos.manifestations.get(id),
    d.repos.observations.byManifestation(id),
    d.repos.briefings.get(id),
  ]);
  return {
    status: m!.status,
    startedAt: m!.startedAt,
    endedAt: m!.endedAt,
    observationCount: observations.length,
    observations: asOwner ? observations : null,
    briefing: asOwner ? briefing : null,
  };
}
