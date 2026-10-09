import type {
  UserId,
  AuditEntry,
  Block,
  Report,
  Agent,
  AgentId,
  AgentMessage,
  AgentMemory,
  AskTurn,
  MemoryId,
  Suggestion,
  Action,
  AgentAttention,
  Outing,
  Encounter,
  ApiKey,
  Frame,
  FrameId,
  ApiKeyId,
  EncounterId,
  OutingId,
  ActionId,
  SuggestionId,
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
  readonly suggestions = new Map<SuggestionId, Suggestion>();
  readonly actions = new Map<ActionId, Action>();
  readonly attention = new Map<AgentId, AgentAttention>();
  readonly outings = new Map<OutingId, Outing>();
  readonly encounters = new Map<EncounterId, Encounter>();
  readonly apiKeys = new Map<ApiKeyId, ApiKey>();
  readonly frames = new Map<FrameId, Frame>();
  readonly accounts = new Map<string, UserId>();
  readonly audit: AuditEntry[] = [];
  readonly blocks: Block[] = [];
  readonly reports: Report[] = [];
  readonly attentionClaims = new Map<AgentId, number>();
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
      byTokenHash: async (hash) =>
        [...this.endpoints.values()].find((e) => e.tokenHash === hash) ?? null,
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
        // Like the database: the cursor and liveness have their own writers.
        this.manifestations.set(
          m.id,
          current
            ? {
                ...m,
                observedThroughSec: current.observedThroughSec,
                lastHeardAt: current.lastHeardAt,
              }
            : m,
        );
        return true;
      },
      contexts: async (f) => {
        if (
          [f.ids, f.agentIds, f.endpointIds, f.eventIds].some(
            (x) => x && x.length === 0,
          )
        )
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
          if (f.eventIds && !f.eventIds.includes(event.id)) continue;
          if (f.status && manifestation.status !== f.status) continue;
          out.push({ manifestation, mission, agent, event, endpoint });
        }
        return out.sort((a, b) =>
          b.manifestation.createdAt.localeCompare(a.manifestation.createdAt),
        );
      },
      heard: async (id, at) => {
        const m = this.manifestations.get(id);
        if (m) this.manifestations.set(id, { ...m, lastHeardAt: at });
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
      byIds: async (ids) => this.observations.filter((o) => ids.includes(o.id)),
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
    frames: {
      save: async (f) => void this.frames.set(f.id, f),
      get: async (id) => this.frames.get(id) ?? null,
    },
    apiKeys: {
      byHash: async (hash) =>
        [...this.apiKeys.values()].find(
          (k) => k.hash === hash && !k.revokedAt,
        ) ?? null,
      byAgent: async (agentId) =>
        [...this.apiKeys.values()]
          .filter((k) => k.agentId === agentId)
          .sort(by((k) => k.createdAt))
          .reverse(),
      get: async (id) => this.apiKeys.get(id) ?? null,
      save: async (k) => void this.apiKeys.set(k.id, k),
    },
    audit: {
      record: async (e) => void this.audit.push(e),
      forUser: async (userId, limit) =>
        this.audit
          .filter((e) => e.involved.includes(userId))
          .sort(by((e) => e.at))
          .reverse()
          .slice(0, limit),
    },
    blocks: {
      isBlocked: async (hostId, ownerId) =>
        this.blocks.some((b) => b.hostId === hostId && b.ownerId === ownerId),
      byHost: async (hostId) => this.blocks.filter((b) => b.hostId === hostId),
      save: async (b) => {
        if (
          !this.blocks.some(
            (x) => x.hostId === b.hostId && x.ownerId === b.ownerId,
          )
        )
          this.blocks.push(b);
      },
      remove: async (hostId, ownerId) => {
        const i = this.blocks.findIndex(
          (b) => b.hostId === hostId && b.ownerId === ownerId,
        );
        if (i >= 0) this.blocks.splice(i, 1);
      },
    },
    reports: {
      save: async (r) => void this.reports.push(r),
    },
    accounts: {
      claim: async (authId, guestId) => {
        const existing = this.accounts.get(authId);
        if (existing) return existing;
        const taken = [...this.accounts.values()].includes(guestId);
        const id = taken ? (authId as UserId) : guestId;
        this.accounts.set(authId, id);
        return id;
      },
    },
    encounters: {
      byAgent: async (agentId) =>
        [...this.encounters.values()]
          .filter((e) => e.sides.some((s) => s.agentId === agentId))
          .sort(by((e) => e.createdAt))
          .reverse(),
      get: async (id) => this.encounters.get(id) ?? null,
      exists: async (eventId, a, b) =>
        [...this.encounters.values()].some(
          (e) =>
            e.eventId === eventId &&
            e.sides.some((s) => s.agentId === a) &&
            e.sides.some((s) => s.agentId === b),
        ),
      save: async (e) => void this.encounters.set(e.id, e),
    },
    outings: {
      byAgent: async (agentId) =>
        [...this.outings.values()]
          .filter((o) => o.agentId === agentId)
          .sort(by((o) => o.createdAt))
          .reverse(),
      get: async (id) => this.outings.get(id) ?? null,
      save: async (o) => void this.outings.set(o.id, o),
    },
    attention: {
      get: async (agentId) => this.attention.get(agentId) ?? null,
      claim: async (agentId, now, everySec) => {
        const last = this.attentionClaims.get(agentId);
        const t = Date.parse(now);
        if (last !== undefined && t - last < everySec * 1000) return false;
        this.attentionClaims.set(agentId, t);
        return true;
      },
      save: async (a) => void this.attention.set(a.agentId, a),
    },
    actions: {
      byAgent: async (agentId) =>
        [...this.actions.values()]
          .filter((a) => a.agentId === agentId)
          .sort(by((a) => a.createdAt))
          .reverse(),
      get: async (id) => this.actions.get(id) ?? null,
      save: async (as) => as.forEach((a) => this.actions.set(a.id, a)),
    },
    suggestions: {
      byAgent: async (agentId) =>
        [...this.suggestions.values()]
          .filter((s) => s.agentId === agentId)
          .sort(by((s) => s.createdAt))
          .reverse(),
      get: async (id) => this.suggestions.get(id) ?? null,
      save: async (ss) => ss.forEach((s) => this.suggestions.set(s.id, s)),
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
