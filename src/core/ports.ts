import type { Agent, AgentCard } from "./agent";
import type { Endpoint } from "./endpoint";
import type { HostListing, PresenceEvent } from "./event";
import type {
  AgentId,
  EventId,
  ManifestationId,
  MissionId,
  HostRequestId,
  MemoryId,
  SuggestionId,
  ActionId,
  OutingId,
  EncounterId,
  ApiKeyId,
  FrameId,
  ObservationId,
  SegmentId,
  UserId,
} from "./ids";
import type { Manifestation } from "./manifestation";
import type { Mission, PlanItem } from "./mission";
import type { Observation, TranscriptSegment } from "./observation";
import type { AskTurn } from "./ask";
import type {
  AgentMemory,
  HeardWorthRemembering,
  LearnedFromOwner,
} from "./memory";
import type { AgentMessage, HostRequest } from "./presence";
import type { Suggestion } from "./suggestion";
import type { Action, ActionKind, ActionPayload } from "./action";
import type { AgentAttention } from "./attention";
import type { Outing } from "./outing";
import type { Encounter } from "./encounter";
import type { ApiKey } from "./api-key";
import type { Frame } from "./frame";

// Everything vendor specific lives behind these. Core and pipeline import only this file.

/** Speech to text. Deepgram is adapter #1. */
export interface TranscriptionProvider {
  transcribe(
    input: AudioInput,
  ): Promise<Omit<TranscriptSegment, "id" | "manifestationId">[]>;
}

export interface AudioInput {
  bytes: Uint8Array;
  mimeType: string;
  /** Where this chunk sits in the manifestation, so segment times are absolute. */
  offsetSec: number;
}

/**
 * The agent's brain. Our native agent (Claude) is provider #1; an external agent
 * implements the same three calls. Providers never touch storage directly.
 */
export interface AgentProvider {
  /**
   * New transcript in; notes, interruptions for the owner, and asks for the host out.
   * Called on a rolling window during a live session.
   */
  observe(input: ObserveInput): Promise<ObserveResult>;
  /** The owner says something to the agent mid-session. It replies and may change course. */
  converse(input: ConverseInput): Promise<ConverseResult>;
  /** End of manifestation: turn observations into the owner's briefing. */
  brief(input: BriefInput): Promise<BriefResult>;
  /** Owner asks a question; answer only from what the agent experienced. */
  answer(input: AnswerInput): Promise<AnswerResult>;
  /** Before it goes: how it will serve its owner's goals at this event. */
  plan(input: PlanInput): Promise<NewPlanItem[]>;
  /** After an event: what its owner should do, looking across everything heard so far. */
  reflect(input: ReflectInput): Promise<NewSuggestion[]>;
  /** Prepare an action for the owner to approve: an email, invite, contact, to do or note. */
  prepare(input: PrepareInput): Promise<PreparedAction>;
  /** Present in several rooms: weigh them against each other and decide where attention goes. */
  orchestrate(input: OrchestrateInput): Promise<Orchestration>;
  /** Decide where to be: rank what's on against the owner's goals, pick hosts, write missions. */
  scout(input: ScoutInput): Promise<ScoutResult>;
  /** Another agent at the same event: should this agent's owner know its owner? Sees only their card. */
  assess(input: AssessInput): Promise<{ relevant: boolean; why: string }>;
  /** Something the body's camera saw: notes on what in it matters to the owner. */
  see(input: SeeInput): Promise<NewObservation[]>;
}

export interface SeeInput extends PresenceInput {
  image: { bytes: Uint8Array; mimeType: string };
  /** What the host or device said about the image, if anything. */
  caption: string | null;
}

export interface AssessInput {
  agent: Agent;
  memories: AgentMemory[];
  event: PresenceEvent;
  other: Pick<AgentCard, "name" | "about">;
}

export interface ScoutCandidate {
  event: PresenceEvent;
  hosts: {
    hostId: UserId;
    displayName: string;
    priceCents: number;
    openToRequests: boolean;
  }[];
}

export interface ScoutInput {
  agent: Agent;
  memories: AgentMemory[];
  request: string;
  budgetCents: number;
  candidates: ScoutCandidate[];
}

export interface ScoutResult {
  /** Best first. Pipeline enforces the budget and that each host is real. */
  picks: {
    eventId: EventId;
    hostId: UserId;
    why: string;
    instructions: string;
  }[];
  skipped: { eventId: EventId; why: string }[];
}

export interface RoomInput {
  manifestationId: ManifestationId;
  eventTitle: string;
  plan: PlanItem[];
  /** The latest notes from that room, oldest first. */
  notes: Observation[];
}

export interface OrchestrateInput {
  agent: Agent;
  memories: AgentMemory[];
  rooms: RoomInput[];
  previous: AgentAttention | null;
}

export type Orchestration = Pick<AgentAttention, "rooms" | "focus" | "pattern">;

/** The owner (or a suggestion) asked for an action; the agent fills in the details. */
export interface ActRequest {
  kind: ActionKind;
  /** What to do, in words: the owner's request, or the suggestion it follows. */
  instruction: string;
  /** Who it's for, as named, if anyone. */
  target: string | null;
}

export interface PrepareInput extends ActRequest {
  agent: Agent;
  memories: AgentMemory[];
  notes: NoteInContext[];
  recentActions: Action[];
}

export interface PreparedAction {
  payload: ActionPayload;
  why: string;
}

/** A note with where it was heard, for reasoning across events. */
export interface NoteInContext {
  note: Observation;
  eventTitle: string;
}

export interface ReflectInput {
  agent: Agent;
  memories: AgentMemory[];
  /** The event that just ended. */
  event: PresenceEvent;
  /** Notes from it. */
  notes: Observation[];
  /** Related notes from earlier events. */
  earlier: NoteInContext[];
  /** Suggestions still open, so it doesn't repeat itself. */
  open: Pick<Suggestion, "text">[];
  /** What it has already done for its owner, so it doesn't suggest it again. */
  recentActions: Action[];
}

export type NewSuggestion = Pick<
  Suggestion,
  "kind" | "text" | "why" | "offer" | "target" | "evidence"
>;

export interface PlanInput {
  agent: Agent;
  /** Active memories: goals above all, plus experiences that bear on this event. */
  memories: AgentMemory[];
  mission: Mission;
  event: PresenceEvent;
}

/** goalId must be one of the goal memories passed in, or null for the mission itself. */
export type NewPlanItem = Omit<PlanItem, "id">;

/** What a provider returns. Ids, timing and ownership are filled in by the pipeline, not the model. */
export type NewObservation = Omit<
  Observation,
  | "id"
  | "agentId"
  | "manifestationId"
  | "atSec"
  | "createdAt"
  | "hostRequestId"
  | "frames"
>;

/** Everything the agent knows about where it is right now. */
export interface PresenceInput {
  agent: Agent;
  /** Its long term memory that bears on this moment. Active memories only. */
  memories: AgentMemory[];
  mission: Mission;
  event: PresenceEvent;
  /** Recent observations from this manifestation, so the agent doesn't repeat itself. */
  recent: Observation[];
  /** Recent conversation with the owner in this session, oldest first. */
  conversation: AgentMessage[];
  /** Requests already proposed or with the host, so it doesn't ask twice. */
  requests: HostRequest[];
  /** Whether this host has agreed to take requests at all. */
  hostTakesRequests: boolean;
  /** What it knows from elsewhere: its memory and its other live sessions. */
  related: RelatedNote[];
  /** What it has done or prepared for its owner lately. */
  recentActions: Action[];
}

export interface ObserveInput extends PresenceInput {
  window: TranscriptSegment[];
}

/** A note from another session, so one agent can connect what it hears across rooms. */
export interface RelatedNote {
  text: string;
  eventTitle: string;
  /** True when that session is happening right now. */
  live: boolean;
}

/** The agent interrupting its owner. Must rest on transcript, like a note. */
export interface NewNudge {
  text: string;
  evidence: SegmentId[];
}

/** Something the agent wants done in the room. `ask` is written to the host. */
export interface NewAsk {
  ask: string;
  why: string;
}

export interface ObserveResult {
  observations: NewObservation[];
  nudges: NewNudge[];
  asks: NewAsk[];
}

export interface ConverseInput extends PresenceInput {
  message: string;
}

export interface ConverseResult {
  /** What the agent says back. */
  reply: string;
  /** New standing orders to add, if the owner changed what it should focus on. */
  addOrders: string[];
  /** New asks for the host, if the owner told it to ask something. */
  asks: NewAsk[];
  /** Proposed requests the owner just approved in words ("yes, ask them"). */
  approve: HostRequestId[];
  /** Durable things the owner just said about themselves, their goals, or how the agent should behave. */
  learn: LearnedFromOwner[];
  /** Actions the owner asked for ("email Sarah about..."). Prepared, then approved by them. */
  act: ActRequest[];
}

export interface BriefInput {
  agent: Agent;
  memories: AgentMemory[];
  mission: Mission;
  event: PresenceEvent;
  observations: Observation[];
}

export interface Briefing {
  headline: string[];
  followUps: { name: string; why: string }[];
  openQuestions: string[];
  markdown: string;
  /** Notes behind each headline point and follow up, index aligned, so every claim traces to audio. */
  cites: { headline: ObservationId[][]; followUps: ObservationId[][] };
}

/** The briefing, plus what from this session the agent would like to remember. */
export interface BriefResult extends Briefing {
  remember: HeardWorthRemembering[];
}

export interface AnswerResult {
  answer: string;
  learn: LearnedFromOwner[];
  act: ActRequest[];
}

export interface AnswerInput {
  agent: Agent;
  memories: AgentMemory[];
  recentActions: Action[];
  question: string;
  /** Retrieved by the memory port, already scoped to this agent. */
  observations: Observation[];
  /** Event title per manifestation id, so the answer can say where something was heard. */
  eventTitles: Record<string, string>;
  /** Earlier turns of this conversation, oldest first. */
  history: Pick<AskTurn, "question" | "answer">[];
}

/** Agent memory retrieval. pgvector in Supabase is adapter #1. */
export interface Memory {
  index(observations: Observation[]): Promise<void>;
  recall(
    agentId: AgentId,
    query: string,
    limit: number,
  ): Promise<Observation[]>;
}

/** Raw audio chunks. */
export interface BlobStore {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

/** Persistence. One small repo per aggregate keeps adapters easy to swap and to fake in tests. */
export interface Repos {
  agents: {
    get(id: AgentId): Promise<Agent | null>;
    byOwner(ownerId: UserId): Promise<Agent[]>;
    save(a: Agent): Promise<void>;
  };
  events: {
    get(id: EventId): Promise<PresenceEvent | null>;
    save(e: PresenceEvent): Promise<void>;
    list(range: { from: string; to: string }): Promise<PresenceEvent[]>;
    listings(id: EventId): Promise<HostListing[]>;
    /** Listings for many events in one round trip. */
    listingsFor(ids: EventId[]): Promise<HostListing[]>;
    saveListing(l: HostListing): Promise<void>;
  };
  endpoints: {
    get(id: Endpoint["id"]): Promise<Endpoint | null>;
    byHost(hostId: UserId): Promise<Endpoint[]>;
    /** A device calling the device API, by the hash of its token. */
    byTokenHash(hash: string): Promise<Endpoint | null>;
    save(e: Endpoint): Promise<void>;
  };
  missions: {
    get(id: MissionId): Promise<Mission | null>;
    save(m: Mission): Promise<void>;
  };
  manifestations: {
    get(id: ManifestationId): Promise<Manifestation | null>;
    byAgent(
      id: AgentId,
      status?: Manifestation["status"],
    ): Promise<Manifestation[]>;
    /** Newest first. */
    byEndpoints(ids: Endpoint["id"][]): Promise<Manifestation[]>;
    /**
     * Sessions with everything around them, in one round trip. Filters combine with AND;
     * an empty filter list matches nothing. Newest first.
     */
    contexts(filter: SessionFilter): Promise<SessionContext[]>;
    /**
     * Optimistic: only writes if the stored status still equals `expected` (null = insert).
     * Returns false when someone else changed it first.
     */
    save(
      m: Manifestation,
      expected: Manifestation["status"] | null,
    ): Promise<boolean>;
    /** Record that the body sent something. Never touches status. */
    heard(id: ManifestationId, at: string): Promise<void>;
    /** Compare and set on observedThroughSec. Returns false if `from` is stale, so only one worker owns a window. */
    advanceCursor(
      id: ManifestationId,
      from: number,
      to: number,
    ): Promise<boolean>;
  };
  segments: {
    /** Upsert by id. Segment ids are deterministic, so a retried chunk never duplicates transcript. */
    append(s: TranscriptSegment[]): Promise<void>;
    /** Segments ending after `afterSec`, ordered by start. */
    since(id: ManifestationId, afterSec: number): Promise<TranscriptSegment[]>;
    /** Specific lines, for showing the source of a note. */
    byIds(
      manifestationId: ManifestationId,
      ids: SegmentId[],
    ): Promise<TranscriptSegment[]>;
  };
  observations: {
    append(o: Observation[]): Promise<void>;
    byManifestation(id: ManifestationId): Promise<Observation[]>;
    /** Notes for many sessions in one round trip. */
    byManifestations(ids: ManifestationId[]): Promise<Observation[]>;
    byIds(ids: ObservationId[]): Promise<Observation[]>;
  };
  briefings: {
    get(id: ManifestationId): Promise<StoredBriefing | null>;
    save(b: StoredBriefing): Promise<void>;
  };
  messages: {
    append(m: AgentMessage[]): Promise<void>;
    /** Oldest first. */
    byManifestation(id: ManifestationId): Promise<AgentMessage[]>;
    /** For many sessions at once, oldest first. */
    byManifestations(ids: ManifestationId[]): Promise<AgentMessage[]>;
  };
  hostRequests: {
    get(id: HostRequestId): Promise<HostRequest | null>;
    /** Optimistic like manifestations: null expected = insert; false when someone moved it first. */
    save(
      r: HostRequest,
      expected: HostRequest["status"] | null,
    ): Promise<boolean>;
    /** Oldest first. */
    byManifestation(id: ManifestationId): Promise<HostRequest[]>;
  };
  memories: {
    /** Everything, active and proposed, oldest first. */
    byAgent(agentId: AgentId): Promise<AgentMemory[]>;
    get(id: MemoryId): Promise<AgentMemory | null>;
    /** Upsert. */
    save(m: AgentMemory[]): Promise<void>;
    remove(id: MemoryId): Promise<void>;
  };
  frames: {
    save(f: Frame): Promise<void>;
    get(id: FrameId): Promise<Frame | null>;
  };
  apiKeys: {
    /** Only live keys: revoked ones never authenticate. */
    byHash(hash: string): Promise<ApiKey | null>;
    /** Newest first, revoked included. */
    byAgent(agentId: AgentId): Promise<ApiKey[]>;
    get(id: ApiKeyId): Promise<ApiKey | null>;
    save(k: ApiKey): Promise<void>;
  };
  accounts: {
    /**
     * The Omnipra user behind a signed in account. On first sign in, the account takes
     * over `guestId` (everything made in this browser before signing in), unless that
     * guest already belongs to another account, in which case it gets a fresh user.
     */
    claim(
      authId: string,
      guestId: UserId,
      email: string | null,
    ): Promise<UserId>;
  };
  encounters: {
    /** Encounters this agent is on either side of. Newest first. */
    byAgent(agentId: AgentId): Promise<Encounter[]>;
    get(id: EncounterId): Promise<Encounter | null>;
    /** Whether these two agents have already met at this event. */
    exists(eventId: EventId, a: AgentId, b: AgentId): Promise<boolean>;
    save(e: Encounter): Promise<void>;
  };
  outings: {
    /** Newest first. */
    byAgent(agentId: AgentId): Promise<Outing[]>;
    get(id: OutingId): Promise<Outing | null>;
    save(o: Outing): Promise<void>;
  };
  attention: {
    get(agentId: AgentId): Promise<AgentAttention | null>;
    /**
     * Take the right to orchestrate this agent now, if nobody has in the last
     * `everySec`. Exactly one caller wins, however many rooms report at once.
     */
    claim(agentId: AgentId, now: string, everySec: number): Promise<boolean>;
    save(a: AgentAttention): Promise<void>;
  };
  actions: {
    /** Newest first. */
    byAgent(agentId: AgentId): Promise<Action[]>;
    get(id: ActionId): Promise<Action | null>;
    /** Upsert. */
    save(a: Action[]): Promise<void>;
  };
  suggestions: {
    /** Newest first. */
    byAgent(agentId: AgentId): Promise<Suggestion[]>;
    get(id: SuggestionId): Promise<Suggestion | null>;
    /** Upsert. */
    save(s: Suggestion[]): Promise<void>;
  };
  askTurns: {
    append(t: AskTurn): Promise<void>;
    /** The latest `limit` turns, oldest first. */
    recent(agentId: AgentId, limit: number): Promise<AskTurn[]>;
    clear(agentId: AgentId): Promise<void>;
  };
}

/** A session and everything it hangs off, so screens never fetch them one by one. */
export interface SessionContext {
  manifestation: Manifestation;
  mission: Mission;
  agent: Agent;
  event: PresenceEvent;
  endpoint: Endpoint;
}

export interface SessionFilter {
  ids?: ManifestationId[];
  agentIds?: AgentId[];
  endpointIds?: Endpoint["id"][];
  eventIds?: EventId[];
  status?: Manifestation["status"];
}

export interface StoredBriefing extends Briefing {
  manifestationId: ManifestationId;
  createdAt: string;
}

/**
 * One way of carrying out an approved action. The local ones need no account
 * (your mail app, a calendar file, a contact card); connected ones (Gmail, Google
 * Calendar) plug in here later without touching anything else.
 */
export interface ActionExecutor {
  /** Stable id, used in URLs: "mail-app", "ics", "vcard". */
  id: string;
  /** What the button says: "Open in your mail app". */
  label: string;
  handles(kind: ActionKind): boolean;
  run(action: Action): Promise<Execution>;
}

/** What running an action produced, for the browser to finish (open a link, save a file). */
export interface Execution {
  /** How it was carried out, in words. Becomes the agent's record of it. */
  how: string;
  /** A link to open, such as mailto:. */
  open?: string;
  /** A file to save. */
  file?: { name: string; mime: string; body: string };
  /** Text to put on the clipboard. */
  copy?: string;
}
