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
