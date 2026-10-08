import type {
  Agent,
  Manifestation,
  ManifestationId,
  Observation,
  PresenceEvent,
  StoredBriefing,
  UserId,
} from "@/core";
import { loadContext, type Deps } from "@/pipeline";

/** Read models for screens. Composed from ports; no business rules live here. */

export interface ManifestationRow {
  manifestation: Manifestation;
  event: PresenceEvent;
  agentName: string;
  hostName: string | null;
  instructions: string;
  observations: number;
  important: number;
  /** Most recent note, by when it was said. Owner views only; hosts never get content. */
  latest: Observation | null;
}

async function row(
  d: Deps,
  m: Manifestation,
  opts: { withContent: boolean },
): Promise<ManifestationRow> {
  const ctx = await loadContext(d, m.id);
  const [observations, listings] = await Promise.all([
    d.repos.observations.byManifestation(m.id),
    d.repos.events.listings(ctx.event.id),
  ]);
  const endpoint = await d.repos.endpoints.get(m.endpointId);
  return {
    manifestation: m,
    event: ctx.event,
    agentName: ctx.agent.name,
    hostName:
      listings.find((l) => l.hostId === endpoint?.hostId)?.displayName ?? null,
    instructions: ctx.mission.instructions,
    observations: observations.length,
    important: observations.filter((o) => o.importance === 3).length,
    latest: opts.withContent ? latestSaid(observations) : null,
  };
}

function latestSaid(observations: Observation[]): Observation | null {
  let best: Observation | null = null;
  for (const o of observations) {
    if (!best || (o.atSec ?? -1) > (best.atSec ?? -1)) best = o;
  }
  return best;
}

/** Every live session across all of an owner's agents: the multi-presence view. */
export async function liveAcross(
  d: Deps,
  agents: Agent[],
): Promise<ManifestationRow[]> {
  const perAgent = await Promise.all(
    agents.map((a) => d.repos.manifestations.byAgent(a.id, "live")),
  );
  const rows = await Promise.all(
    perAgent.flat().map((m) => row(d, m, { withContent: true })),
  );
  return rows.sort((a, b) =>
    (a.manifestation.startedAt ?? "").localeCompare(
      b.manifestation.startedAt ?? "",
    ),
  );
}

export async function agentHome(
  d: Deps,
  agent: Agent,
): Promise<ManifestationRow[]> {
  return Promise.all(
    (await d.repos.manifestations.byAgent(agent.id)).map((m) =>
      row(d, m, { withContent: true }),
    ),
  );
}

export async function hostInbox(
  d: Deps,
  hostId: UserId,
): Promise<ManifestationRow[]> {
  const endpoints = await d.repos.endpoints.byHost(hostId);
  const ms = await d.repos.manifestations.byEndpoints(
    endpoints.map((e) => e.id),
  );
  return Promise.all(ms.map((m) => row(d, m, { withContent: false })));
}

/** What a live view polls. Hosts get counts only; the intelligence belongs to the owner. */
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
