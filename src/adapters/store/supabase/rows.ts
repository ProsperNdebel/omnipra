import type {
  Agent,
  AgentId,
  AgentMessage,
  AgentMemory,
  AskTurn,
  MemoryId,
  Suggestion,
  Action,
  ActionId,
  ActionOrigin,
  ActionPayload,
  ActionStatus,
  SuggestionId,
  SuggestionKind,
  SuggestionOffer,
  SuggestionStatus,
  MemoryKind,
  MemorySource,
  MemoryStatus,
  AskTurnId,
  Autonomy,
  HostRequest,
  HostRequestId,
  HostRequestStatus,
  MessageId,
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
  ObservationBasis,
  ObservationId,
  PlanItem,
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
    style: (r.style as string | null) ?? "",
    lookFor: r.look_for as LookFor[],
    provider: r.provider as AgentProviderKind,
    createdAt: r.created_at as string,
  }),
  to: (a: Agent): Row => ({
    id: a.id,
    owner_id: a.ownerId,
    name: a.name,
    profile: a.profile,
    style: a.style,
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
    openToRequests: (r.open_to_requests as boolean | null) ?? false,
    priceCents: r.price_cents as number,
    createdAt: r.created_at as string,
  }),
  to: (l: HostListing): Row => ({
    event_id: l.eventId,
    host_id: l.hostId,
    display_name: l.displayName,
    endpoint_id: l.endpointId,
    offers: l.offers,
    open_to_requests: l.openToRequests,
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
    autonomy: ((r.autonomy as Autonomy | null) ?? "ask_first") as Autonomy,
    orders: (r.orders as string[] | null) ?? [],
    plan: (r.plan as PlanItem[] | null) ?? null,
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
    autonomy: m.autonomy,
    orders: m.orders,
    plan: m.plan,
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
    captureConfirmedAt: (r.capture_confirmed_at as string | null) ?? null,
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
    capture_confirmed_at: m.captureConfirmedAt,
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
    basis: (r.basis as ObservationBasis | null) ?? "claim",
    speaker: (r.speaker as string | null) ?? null,
    planItem: (r.plan_item as string | null) ?? null,
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
    basis: o.basis,
    speaker: o.speaker,
    plan_item: o.planItem,
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
    // Briefings written before citations existed have none.
    cites: (r.cites as StoredBriefing["cites"] | null) ?? {
      headline: [],
      followUps: [],
    },
    createdAt: r.created_at as string,
  }),
  to: (b: StoredBriefing): Row => ({
    manifestation_id: b.manifestationId,
    headline: b.headline,
    follow_ups: b.followUps,
    open_questions: b.openQuestions,
    markdown: b.markdown,
    cites: b.cites,
    created_at: b.createdAt,
  }),
};

export const message = {
  from: (r: Row): AgentMessage => ({
    id: r.id as MessageId,
    manifestationId: r.manifestation_id as ManifestationId,
    agentId: r.agent_id as AgentId,
    from: r.sender as AgentMessage["from"],
    kind: r.kind as AgentMessage["kind"],
    text: r.text as string,
    atSec: (r.at_sec as number | null) ?? null,
    createdAt: r.created_at as string,
  }),
  to: (m: AgentMessage): Row => ({
    id: m.id,
    manifestation_id: m.manifestationId,
    agent_id: m.agentId,
    sender: m.from,
    kind: m.kind,
    text: m.text,
    at_sec: m.atSec,
    created_at: m.createdAt,
  }),
};

export const hostRequest = {
  from: (r: Row): HostRequest => ({
    id: r.id as HostRequestId,
    manifestationId: r.manifestation_id as ManifestationId,
    agentId: r.agent_id as AgentId,
    ask: r.ask as string,
    why: r.why as string,
    origin: r.origin as HostRequest["origin"],
    status: r.status as HostRequestStatus,
    hostNote: (r.host_note as string | null) ?? null,
    createdAt: r.created_at as string,
    sentAt: (r.sent_at as string | null) ?? null,
    resolvedAt: (r.resolved_at as string | null) ?? null,
  }),
  to: (h: HostRequest): Row => ({
    id: h.id,
    manifestation_id: h.manifestationId,
    agent_id: h.agentId,
    ask: h.ask,
    why: h.why,
    origin: h.origin,
    status: h.status,
    host_note: h.hostNote,
    created_at: h.createdAt,
    sent_at: h.sentAt,
    resolved_at: h.resolvedAt,
  }),
};

export const askTurn = {
  from: (r: Row): AskTurn => ({
    id: r.id as AskTurnId,
    agentId: r.agent_id as AgentId,
    question: r.question as string,
    answer: r.answer as string,
    basedOn: r.based_on as number,
    createdAt: r.created_at as string,
  }),
  to: (t: AskTurn): Row => ({
    id: t.id,
    agent_id: t.agentId,
    question: t.question,
    answer: t.answer,
    based_on: t.basedOn,
    created_at: t.createdAt,
  }),
};

export const memory = {
  from: (r: Row): AgentMemory => ({
    id: r.id as MemoryId,
    agentId: r.agent_id as AgentId,
    kind: r.kind as MemoryKind,
    text: r.text as string,
    status: r.status as MemoryStatus,
    source: r.source as MemorySource,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }),
  to: (m: AgentMemory): Row => ({
    id: m.id,
    agent_id: m.agentId,
    kind: m.kind,
    text: m.text,
    status: m.status,
    source: m.source,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  }),
};

export const suggestion = {
  from: (r: Row): Suggestion => ({
    id: r.id as SuggestionId,
    agentId: r.agent_id as AgentId,
    manifestationId: r.manifestation_id as ManifestationId,
    kind: r.kind as SuggestionKind,
    text: r.text as string,
    why: r.why as string,
    offer: (r.offer as SuggestionOffer | null) ?? null,
    target: (r.target as string | null) ?? null,
    evidence: r.evidence as ObservationId[],
    status: r.status as SuggestionStatus,
    draft: (r.draft as string | null) ?? null,
    createdAt: r.created_at as string,
    resolvedAt: (r.resolved_at as string | null) ?? null,
  }),
  to: (s: Suggestion): Row => ({
    id: s.id,
    agent_id: s.agentId,
    manifestation_id: s.manifestationId,
    kind: s.kind,
    text: s.text,
    why: s.why,
    offer: s.offer,
    target: s.target,
    evidence: s.evidence,
    status: s.status,
    draft: s.draft,
    created_at: s.createdAt,
    resolved_at: s.resolvedAt,
  }),
};

export const action = {
  from: (r: Row): Action => ({
    id: r.id as ActionId,
    agentId: r.agent_id as AgentId,
    payload: r.payload as ActionPayload,
    why: (r.why as string | null) ?? "",
    evidence: (r.evidence as ObservationId[] | null) ?? [],
    origin: r.origin as ActionOrigin,
    status: r.status as ActionStatus,
    how: (r.how as string | null) ?? null,
    createdAt: r.created_at as string,
    doneAt: (r.done_at as string | null) ?? null,
  }),
  to: (a: Action): Row => ({
    id: a.id,
    agent_id: a.agentId,
    kind: a.payload.kind,
    payload: a.payload,
    why: a.why,
    evidence: a.evidence,
    origin: a.origin,
    status: a.status,
    how: a.how,
    created_at: a.createdAt,
    done_at: a.doneAt,
  }),
};
