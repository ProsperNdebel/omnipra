import type { AgentId, ISODate, ManifestationId, ObservationId } from "./ids";

/**
 * One intelligence across many bodies: how the agent is dividing its attention
 * between the rooms it is in right now.
 */
export type RoomValue = "high" | "medium" | "low";

export interface RoomState {
  manifestationId: ManifestationId;
  /** How much this room matters to the owner's goals right now. */
  value: RoomValue;
  /** What is happening there, in a line, to the owner. */
  status: string;
}

export interface AgentAttention {
  agentId: AgentId;
  rooms: RoomState[];
  /** The room that matters most right now, if one clearly does. */
  focus: { manifestationId: ManifestationId; why: string } | null;
  /** Several rooms hearing variations of the same thing. Rests on notes from at least two of them. */
  pattern: { text: string; evidence: ObservationId[] } | null;
  updatedAt: ISODate;
}

/** How often the agent thinks about a room, by how much it matters. Attention is spent, not just labelled. */
export const THINK_EVERY_SEC: Record<RoomValue, number> = {
  high: 20,
  medium: 30,
  low: 60,
};

/** How often it steps back to look across all its rooms. */
export const ORCHESTRATE_EVERY_SEC = 90;

/**
 * Attention is a judgment about now. Missing a few rounds (rooms ended, the agent is
 * down to one) means it no longer holds, and every room goes back to full attention.
 */
export function currentAttention(
  a: AgentAttention | null,
  now: ISODate,
): AgentAttention | null {
  if (!a) return null;
  const age = Date.parse(now) - Date.parse(a.updatedAt);
  return age > 3 * ORCHESTRATE_EVERY_SEC * 1000 ? null : a;
}
