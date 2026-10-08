import type {
  Agent,
  AgentId,
  AgentProviderKind,
  Capability,
  ContextScope,
  Endpoint,
  EndpointId,
  EndpointKind,
  EventId,
  HostListing,
  LookFor,
  Manifestation,
  ManifestationId,
  ManifestationStatus,
  Mission,
  MissionId,
  Observation,
  ObservationId,
  ObservationKind,
  PresenceEvent,
  CapturePolicy,
  SegmentId,
  StoredBriefing,
  TranscriptSegment,
  UserId,
} from "@/core";

/**
 * snake_case rows <-> camelCase domain objects. The only file that knows column names,
 * so a schema rename touches the migration and this file, nothing else.
 */

type Row = Record<string, unknown>;

export const agent = {
  from: (r: Row): Agent => ({
    id: r.id as AgentId,
    ownerId: r.owner_id as UserId,
    name: r.name as string,
    profile: r.profile as string,
    lookFor: r.look_for as LookFor[],
    provider: r.provider as AgentProviderKind,
    createdAt: r.created_at as string,
  }),
  to: (a: Agent): Row => ({
    id: a.id,
    owner_id: a.ownerId,
    name: a.name,
    profile: a.profile,
    look_for: a.lookFor,
    provider: a.provider,
    created_at: a.createdAt,
  }),
};

export const event = {
  from: (r: Row): PresenceEvent => ({
    id: r.id as EventId,
    title: r.title as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    venue: (r.venue as string | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
    capturePolicy: r.capture_policy as CapturePolicy,
  }),
  to: (e: PresenceEvent): Row => ({
    id: e.id,
    title: e.title,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    venue: e.venue,
    source_url: e.sourceUrl,
    capture_policy: e.capturePolicy,
  }),
};

export const listing = {
  from: (r: Row): HostListing => ({
    eventId: r.event_id as EventId,
    hostId: r.host_id as UserId,
    displayName: r.display_name as string,
    endpointId: r.endpoint_id as EndpointId,
    offers: r.offers as Capability[],
    priceCents: r.price_cents as number,
    createdAt: r.created_at as string,
  }),
  to: (l: HostListing): Row => ({
    event_id: l.eventId,
    host_id: l.hostId,
    display_name: l.displayName,
    endpoint_id: l.endpointId,
    offers: l.offers,
    price_cents: l.priceCents,
    created_at: l.createdAt,
  }),
};

export const endpoint = {
  from: (r: Row): Endpoint => ({
    id: r.id as EndpointId,
    hostId: r.host_id as UserId,
    kind: r.kind as EndpointKind,
    capabilities: r.capabilities as Capability[],
    createdAt: r.created_at as string,
  }),
  to: (e: Endpoint): Row => ({
    id: e.id,
    host_id: e.hostId,
    kind: e.kind,
    capabilities: e.capabilities,
    created_at: e.createdAt,
  }),
};

export const mission = {
  from: (r: Row): Mission => ({
    id: r.id as MissionId,
    agentId: r.agent_id as AgentId,
    eventId: r.event_id as EventId,
    instructions: r.instructions as string,
    alerts: r.alerts as string[],
    context: r.context as ContextScope[],
    requires: r.requires as Capability[],
    createdAt: r.created_at as string,
  }),
  to: (m: Mission): Row => ({
    id: m.id,
    agent_id: m.agentId,
    event_id: m.eventId,
    instructions: m.instructions,
    alerts: m.alerts,
    context: m.context,
    requires: m.requires,
    created_at: m.createdAt,
  }),
};

export const manifestation = {
  from: (r: Row): Manifestation => ({
    id: r.id as ManifestationId,
    missionId: r.mission_id as MissionId,
    endpointId: r.endpoint_id as EndpointId,
    priceCents: r.price_cents as number,
    status: r.status as ManifestationStatus,
    observedThroughSec: r.observed_through_sec as number,
    startedAt: (r.started_at as string | null) ?? null,
    endedAt: (r.ended_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }),
  /** observed_through_sec is deliberately absent: only advanceCursor writes it. */
  to: (m: Manifestation): Row => ({
    id: m.id,
    mission_id: m.missionId,
    endpoint_id: m.endpointId,
    price_cents: m.priceCents,
    status: m.status,
    started_at: m.startedAt,
    ended_at: m.endedAt,
    created_at: m.createdAt,
  }),
};

export const segment = {
  from: (r: Row): TranscriptSegment => ({
    id: r.id as SegmentId,
    manifestationId: r.manifestation_id as ManifestationId,
    speaker: (r.speaker as string | null) ?? null,
    text: r.text as string,
    startSec: r.start_sec as number,
    endSec: r.end_sec as number,
  }),
  to: (s: TranscriptSegment): Row => ({
    id: s.id,
    manifestation_id: s.manifestationId,
    speaker: s.speaker,
    text: s.text,
    start_sec: s.startSec,
    end_sec: s.endSec,
  }),
};

export const observation = {
  from: (r: Row): Observation => ({
    id: r.id as ObservationId,
    agentId: r.agent_id as AgentId,
    manifestationId: r.manifestation_id as ManifestationId,
    kind: r.kind as ObservationKind,
    text: r.text as string,
    importance: r.importance as 1 | 2 | 3,
    alert: (r.alert as string | null) ?? null,
    entities: r.entities as string[],
    evidence: r.evidence as SegmentId[],
    atSec: (r.at_sec as number | null) ?? null,
    createdAt: r.created_at as string,
  }),
  to: (o: Observation): Row => ({
    id: o.id,
    agent_id: o.agentId,
    manifestation_id: o.manifestationId,
    kind: o.kind,
    text: o.text,
    importance: o.importance,
    alert: o.alert,
    entities: o.entities,
    evidence: o.evidence,
    at_sec: o.atSec,
    created_at: o.createdAt,
  }),
};

export const briefing = {
  from: (r: Row): StoredBriefing => ({
    manifestationId: r.manifestation_id as ManifestationId,
    headline: r.headline as string[],
    followUps: r.follow_ups as { name: string; why: string }[],
    openQuestions: r.open_questions as string[],
    markdown: r.markdown as string,
    createdAt: r.created_at as string,
  }),
  to: (b: StoredBriefing): Row => ({
    manifestation_id: b.manifestationId,
    headline: b.headline,
    follow_ups: b.followUps,
    open_questions: b.openQuestions,
    markdown: b.markdown,
    created_at: b.createdAt,
  }),
};
