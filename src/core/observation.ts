import type {
  AgentId,
  ISODate,
  ManifestationId,
  ObservationId,
  SegmentId,
} from "./ids";

/** Raw speech from one manifestation. Input to the agent, never shown as the product. */
export interface TranscriptSegment {
  id: SegmentId;
  manifestationId: ManifestationId;
  speaker: string | null;
  text: string;
  /** Seconds from the start of the manifestation. */
  startSec: number;
  endSec: number;
}

/**
 * The unit of agent memory. Keyed to the agent, not the event, so
 * "what did you learn today" is one query across every manifestation.
 */
export interface Observation {
  id: ObservationId;
  agentId: AgentId;
  manifestationId: ManifestationId;
  kind: ObservationKind;
  text: string;
  /** 1 = background, 2 = relevant, 3 = act on this. */
  importance: 1 | 2 | 3;
  /** Set when this observation matched one of the mission's alerts. */
  alert: string | null;
  /** Named people or companies, for follow ups and cross event recall. */
  entities: string[];
  /** Transcript the observation rests on, so every claim can be traced. */
  evidence: SegmentId[];
  /** Seconds into the session where the cited transcript starts. Null for notes made before this existed. */
  atSec: number | null;
  createdAt: ISODate;
}

export type ObservationKind =
  "insight" | "person" | "company" | "opportunity" | "question" | "number";
