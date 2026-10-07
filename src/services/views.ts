import type { Agent, Manifestation, ManifestationId, Observation, PresenceEvent, StoredBriefing, UserId } from "@/core";
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
}

async function row(d: Deps, m: Manifestation): Promise<ManifestationRow> {
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
    hostName: listings.find((l) => l.hostId === endpoint?.hostId)?.displayName ?? null,
    instructions: ctx.mission.instructions,
    observations: observations.length,
    important: observations.filter((o) => o.importance === 3).length,
  };
}

export async function agentHome(d: Deps, agent: Agent): Promise<ManifestationRow[]> {
  return Promise.all((await d.repos.manifestations.byAgent(agent.id)).map((m) => row(d, m)));
}

export async function hostInbox(d: Deps, hostId: UserId): Promise<ManifestationRow[]> {
  const endpoints = await d.repos.endpoints.byHost(hostId);
  const ms = await d.repos.manifestations.byEndpoints(endpoints.map((e) => e.id));
  return Promise.all(ms.map((m) => row(d, m)));
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

export async function feed(d: Deps, id: ManifestationId, asOwner: boolean): Promise<Feed> {
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
