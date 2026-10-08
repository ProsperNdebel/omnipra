import type { Agent } from "./agent";
import type { Endpoint } from "./endpoint";
import type { HostListing, PresenceEvent } from "./event";
import type {
  AgentId,
  EventId,
  ManifestationId,
  MissionId,
  ObservationId,
  SegmentId,
  UserId,
} from "./ids";
import type { Manifestation } from "./manifestation";
import type { Mission } from "./mission";
import type { Observation, TranscriptSegment } from "./observation";

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
  /** New transcript in, typed observations out. Called on a rolling window during a live session. */
  observe(input: ObserveInput): Promise<NewObservation[]>;
  /** End of manifestation: turn observations into the owner's briefing. */
  brief(input: BriefInput): Promise<Briefing>;
  /** Owner asks a question; answer only from what the agent experienced. */
  answer(input: AnswerInput): Promise<string>;
}

/** What a provider returns. Ids, timing and ownership are filled in by the pipeline, not the model. */
export type NewObservation = Omit<
  Observation,
  "id" | "agentId" | "manifestationId" | "atSec" | "createdAt"
>;

export interface ObserveInput {
  agent: Agent;
  mission: Mission;
  event: PresenceEvent;
  window: TranscriptSegment[];
  /** Recent observations from this manifestation, so the agent doesn't repeat itself. */
  recent: Observation[];
}

export interface BriefInput {
  agent: Agent;
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

export interface AnswerInput {
  agent: Agent;
  question: string;
  /** Retrieved by the memory port, already scoped to this agent. */
  observations: Observation[];
  /** Event title per manifestation id, so the answer can say where something was heard. */
  eventTitles: Record<string, string>;
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
    saveListing(l: HostListing): Promise<void>;
  };
  endpoints: {
    get(id: Endpoint["id"]): Promise<Endpoint | null>;
    byHost(hostId: UserId): Promise<Endpoint[]>;
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
     * Optimistic: only writes if the stored status still equals `expected` (null = insert).
     * Returns false when someone else changed it first.
     */
    save(
      m: Manifestation,
      expected: Manifestation["status"] | null,
    ): Promise<boolean>;
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
  };
  briefings: {
    get(id: ManifestationId): Promise<StoredBriefing | null>;
    save(b: StoredBriefing): Promise<void>;
  };
}

export interface StoredBriefing extends Briefing {
  manifestationId: ManifestationId;
  createdAt: string;
}
