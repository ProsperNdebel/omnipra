import {
  DomainError,
  type Agent,
  type AgentProvider,
  type BlobStore,
  type Manifestation,
  type ManifestationId,
  type Memory,
  type Mission,
  type PresenceEvent,
  type Repos,
  type TranscriptionProvider,
} from "@/core";

/** Everything the pipeline needs, injected. Swap any adapter without touching pipeline code. */
export interface Deps {
  repos: Repos;
  blobs: BlobStore;
  memory: Memory;
  asr: TranscriptionProvider;
  agent: AgentProvider;
  now(): string;
  newId(): string;
}

export interface ManifestationContext {
  manifestation: Manifestation;
  mission: Mission;
  agent: Agent;
  event: PresenceEvent;
}

export async function loadContext(d: Deps, id: ManifestationId): Promise<ManifestationContext> {
  const manifestation = await d.repos.manifestations.get(id);
  if (!manifestation) throw new DomainError("not_found", `manifestation ${id} not found`);
  const mission = await d.repos.missions.get(manifestation.missionId);
  if (!mission) throw new DomainError("not_found", `mission ${manifestation.missionId} not found`);
  const [agent, event] = await Promise.all([d.repos.agents.get(mission.agentId), d.repos.events.get(mission.eventId)]);
  if (!agent) throw new DomainError("not_found", `agent ${mission.agentId} not found`);
  if (!event) throw new DomainError("not_found", `event ${mission.eventId} not found`);
  return { manifestation, mission, agent, event };
}
