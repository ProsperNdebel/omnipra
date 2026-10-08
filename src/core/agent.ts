import type { AgentId, ISODate, UserId } from "./ids";

/**
 * A persistent agent owned by one person. It outlives every event and session.
 * `provider` says whose intelligence runs it: ours today, a third party later.
 */
export interface Agent {
  id: AgentId;
  ownerId: UserId;
  name: string;
  /** Who the owner is and what they care about, in their own words. */
  profile: string;
  /** How the agent carries itself and talks to its owner. Empty means its default voice. */
  style: string;
  /** What other agents may know about its owner. Null: it doesn't meet other agents. */
  card: AgentCard | null;
  /** Standing things to look for on every mission. */
  lookFor: LookFor[];
  provider: AgentProviderKind;
  createdAt: ISODate;
}

export const LOOK_FOR = [
  "ideas",
  "people",
  "companies",
  "opportunities",
  "technical_details",
  "open_questions",
] as const;
export type LookFor = (typeof LOOK_FOR)[number];

export type AgentProviderKind = "native";

/** Sources the owner can let an agent draw on. Gmail and Drive land after the core loop. */
export type ContextScope = "memory" | "gmail" | "drive";

/**
 * The only thing an agent shows other agents, written by its owner. Memories,
 * notes and goals never leave the agent; contact is released only when both owners agree.
 */
export interface AgentCard {
  /** How the owner wants to be named to others ("Po, building Inzwi"). */
  name: string;
  /** A few public sentences: what they work on and who they'd like to meet. */
  about: string;
  /** Shared only after both owners say yes to an introduction. */
  contact: string;
}
