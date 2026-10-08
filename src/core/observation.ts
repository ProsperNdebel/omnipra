import type {
  AgentId,
  HostRequestId,
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
  /** How far to trust it: who it rests on, not just what it says. */
  basis: ObservationBasis;
  /** Who said it, as the room identified them ("Acme's CEO"). Null when it wasn't clear. */
  speaker: string | null;
  /**
   * Set when this came from the host answering one of the agent's requests rather
   * than from the transcript. Such notes have no transcript evidence; the request is the source.
   */
  hostRequestId: HostRequestId | null;
  /** The plan item this advances, if any. How goal progress is counted. */
  planItem: string | null;
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

/**
 * claim: one speaker said it. The default; most of what is heard at events.
 * corroborated: more than one person independently said or agreed to it, or it is
 *   a plain fact of the room itself (who was on stage, what was announced).
 * inference: the agent's own reading, which nobody said outright.
 */
export type ObservationBasis = "claim" | "corroborated" | "inference";
export const OBSERVATION_BASES: readonly ObservationBasis[] = [
  "claim",
  "corroborated",
  "inference",
];
