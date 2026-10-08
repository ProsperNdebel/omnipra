import type {
  Agent,
  AgentId,
  AgentMessage,
  AgentMemory,
  AskTurn,
  MemoryId,
  HostRequest,
  HostRequestId,
  BlobStore,
  Endpoint,
  EventId,
  HostListing,
  Manifestation,
  ManifestationId,
  Memory,
  Mission,
  MissionId,
  Observation,
  PresenceEvent,
  Repos,
  SessionContext,
  StoredBriefing,
  TranscriptSegment,
} from "@/core";

/**
 * Everything in process memory. Lets the whole loop run locally before Supabase exists,
 * and doubles as the fake for tests. Lost on restart; not for production.
 */
export class InMemoryStore implements BlobStore, Memory {
  readonly agents = new Map<AgentId, Agent>();
  readonly events = new Map<EventId, PresenceEvent>();
  readonly listings: HostListing[] = [];
  readonly endpoints = new Map<string, Endpoint>();
  readonly missions = new Map<MissionId, Mission>();
  readonly manifestations = new Map<ManifestationId, Manifestation>();
  readonly segments = new Map<string, TranscriptSegment>();
  readonly observations: Observation[] = [];
  readonly briefings = new Map<ManifestationId, StoredBriefing>();
  readonly messages: AgentMessage[] = [];
  readonly hostRequests = new Map<HostRequestId, HostRequest>();
  askTurns: AskTurn[] = [];
  readonly memories = new Map<MemoryId, AgentMemory>();
  readonly blobs = new Map<string, { bytes: Uint8Array; mimeType: string }>();

  readonly repos: Repos = {
    agents: {
      get: async (id) => this.agents.get(id) ?? null,
      byOwner: async (ownerId) =>
        [...this.agents.values()]
          .filter((a) => a.ownerId === ownerId)
          .sort(by((a) => a.createdAt)),
      save: async (a) => void this.agents.set(a.id, a),
    },
    events: {
      get: async (id) => this.events.get(id) ?? null,
      save: async (e) => void this.events.set(e.id, e),
      list: async ({ from, to }) =>
        [...this.events.values()]
          .filter((e) => e.endsAt >= from && e.startsAt <= to)
          .sort(by((e) => e.startsAt)),
      listings: async (id) => this.listings.filter((l) => l.eventId === id),
      listingsFor: async (ids) =>
        this.listings.filter((l) => ids.includes(l.eventId)),
      saveListing: async (l) => {
        const i = this.listings.findIndex(
          (x) => x.eventId === l.eventId && x.hostId === l.hostId,
        );
        if (i >= 0) this.listings[i] = l;
        else this.listings.push(l);
      },
    },
    endpoints: {
      get: async (id) => this.endpoints.get(id) ?? null,
      byHost: async (hostId) =>
        [...this.endpoints.values()].filter((e) => e.hostId === hostId),
      save: async (e) => void this.endpoints.set(e.id, e),
    },
    missions: {
      get: async (id) => this.missions.get(id) ?? null,
      save: async (m) => void this.missions.set(m.id, m),
    },
    manifestations: {
      get: async (id) => this.manifestations.get(id) ?? null,
      byAgent: async (agentId, status) =>
        [...this.manifestations.values()]
          .filter(
            (m) =>
              this.missions.get(m.missionId)?.agentId === agentId &&
              (!status || m.status === status),
          )
          .sort(by((m) => m.createdAt))
          .reverse(),
      byEndpoints: async (ids) =>
        [...this.manifestations.values()]
          .filter((m) => ids.includes(m.endpointId))
          .sort(by((m) => m.createdAt))
          .reverse(),
      save: async (m, expected) => {
        const current = this.manifestations.get(m.id);
        if ((current?.status ?? null) !== expected) return false;
        this.manifestations.set(m.id, m);
        return true;
      },
      contexts: async (f) => {
        if ([f.ids, f.agentIds, f.endpointIds].some((x) => x && x.length === 0))
          return [];
        const out: SessionContext[] = [];
        for (const manifestation of this.manifestations.values()) {
          const mission = this.missions.get(manifestation.missionId);
          const agent = mission && this.agents.get(mission.agentId);
          const event = mission && this.events.get(mission.eventId);
          const endpoint = this.endpoints.get(manifestation.endpointId);
          if (!mission || !agent || !event || !endpoint) continue;
          if (f.ids && !f.ids.includes(manifestation.id)) continue;
          if (f.agentIds && !f.agentIds.includes(agent.id)) continue;
          if (f.endpointIds && !f.endpointIds.includes(endpoint.id)) continue;
          if (f.status && manifestation.status !== f.status) continue;
          out.push({ manifestation, mission, agent, event, endpoint });
        }
        return out.sort((a, b) =>
          b.manifestation.createdAt.localeCompare(a.manifestation.createdAt),
        );
      },
      advanceCursor: async (id, from, to) => {
        const m = this.manifestations.get(id);
        if (!m || m.observedThroughSec !== from) return false;
        this.manifestations.set(id, { ...m, observedThroughSec: to });
        return true;
      },
    },
    segments: {
      append: async (s) => s.forEach((x) => this.segments.set(x.id, x)),
      byIds: async (id, ids) =>
        ids
          .map((i) => this.segments.get(i))
          .filter(
            (s): s is TranscriptSegment => !!s && s.manifestationId === id,
          )
          .sort(by((s) => s.startSec)),
      since: async (id, afterSec) =>
        [...this.segments.values()]
          .filter((s) => s.manifestationId === id && s.endSec > afterSec)
          .sort(by((s) => s.startSec)),
    },
    observations: {
      append: async (o) => void this.observations.push(...o),
      byManifestation: async (id) =>
        this.observations.filter((o) => o.manifestationId === id),
      byManifestations: async (ids) =>
        this.observations.filter((o) => ids.includes(o.manifestationId)),
    },
    messages: {
      append: async (m) => void this.messages.push(...m),
      byManifestation: async (id) =>
        this.messages.filter((m) => m.manifestationId === id),
      byManifestations: async (ids) =>
        this.messages.filter((m) => ids.includes(m.manifestationId)),
    },
    hostRequests: {
      get: async (id) => this.hostRequests.get(id) ?? null,
      save: async (r, expected) => {
        const current = this.hostRequests.get(r.id);
        if ((current?.status ?? null) !== expected) return false;
        this.hostRequests.set(r.id, r);
        return true;
      },
      byManifestation: async (id) =>
        [...this.hostRequests.values()]
          .filter((r) => r.manifestationId === id)
          .sort(by((r) => r.createdAt)),
    },
    memories: {
      byAgent: async (agentId) =>
        [...this.memories.values()]
          .filter((m) => m.agentId === agentId)
          .sort(by((m) => m.createdAt)),
      get: async (id) => this.memories.get(id) ?? null,
      save: async (ms) => ms.forEach((m) => this.memories.set(m.id, m)),
      remove: async (id) => void this.memories.delete(id),
    },
    askTurns: {
      append: async (t) => void this.askTurns.push(t),
      recent: async (agentId, limit) =>
        this.askTurns.filter((t) => t.agentId === agentId).slice(-limit),
      clear: async (agentId) => {
        this.askTurns = this.askTurns.filter((t) => t.agentId !== agentId);
      },
    },
    briefings: {
      get: async (id) => this.briefings.get(id) ?? null,
      save: async (b) => void this.briefings.set(b.manifestationId, b),
    },
  };

  // BlobStore
  async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    this.blobs.set(key, { bytes, mimeType });
  }
  async get(key: string): Promise<Uint8Array> {
    const b = this.blobs.get(key);
    if (!b) throw new Error(`blob ${key} not found`);
    return b.bytes;
  }

  // Memory: index is a no op; recall scores keyword overlap plus importance. pgvector replaces this in step 4.
  async index(): Promise<void> {}
  async recall(
    agentId: AgentId,
    query: string,
    limit: number,
  ): Promise<Observation[]> {
    const terms = tokenize(query);
    return this.observations
      .filter((o) => o.agentId === agentId)
      .map((o) => {
        const words = tokenize(`${o.text} ${o.entities.join(" ")}`);
        const overlap = [...terms].filter((t) => words.has(t)).length;
        return { o, score: overlap * 2 + o.importance };
      })
      .sort(
        (a, b) =>
          b.score - a.score || b.o.createdAt.localeCompare(a.o.createdAt),
      )
      .slice(0, limit)
      .map((x) => x.o);
  }
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9$.]+/)
      .filter((w) => w.length > 2),
  );
}

function by<T>(key: (t: T) => string | number) {
  return (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}
