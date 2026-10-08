import {
  DomainError,
  LOOK_FOR,
  type Agent,
  type AgentId,
  type LookFor,
  type UserId,
} from "@/core";
import type { Deps } from "@/pipeline";

/** Everyone can own several agents. Newest first, since that's usually the one in use. */
export async function ownerAgents(d: Deps, ownerId: UserId): Promise<Agent[]> {
  return (await d.repos.agents.byOwner(ownerId)).reverse();
}

/** An agent, only if the viewer owns it. Someone else's agent looks the same as a missing one. */
export async function ownedAgent(
  d: Deps,
  ownerId: UserId,
  agentId: string,
): Promise<Agent> {
  const agent = await d.repos.agents.get(agentId as AgentId);
  if (!agent || agent.ownerId !== ownerId) {
    throw new DomainError("not_found", "That agent doesn't exist.");
  }
  return agent;
}

export interface AgentInput {
  name: string;
  profile: string;
  style: string;
  lookFor: string[];
}

/** Below this, an agent has too little to go on and notes come out generic. */
const MIN_PROFILE = 60;

function clean(
  input: AgentInput,
): Pick<Agent, "name" | "profile" | "style" | "lookFor"> {
  const name = input.name.trim();
  const profile = input.profile.trim();
  if (!name) throw new DomainError("bad_request", "Give your agent a name.");
  if (profile.length < MIN_PROFILE) {
    throw new DomainError(
      "bad_request",
      "Tell your agent more. A few sentences on who you are, what you want from events, and what to ignore.",
    );
  }
  return {
    name: name.slice(0, 60),
    profile,
    style: input.style.trim().slice(0, 1000),
    lookFor: input.lookFor.filter((x): x is LookFor =>
      (LOOK_FOR as readonly string[]).includes(x),
    ),
  };
}

export async function createAgent(
  d: Deps,
  ownerId: UserId,
  input: AgentInput,
): Promise<Agent> {
  const agent: Agent = {
    id: d.newId() as AgentId,
    ownerId,
    ...clean(input),
    provider: "native",
    createdAt: d.now(),
  };
  await d.repos.agents.save(agent);
  return agent;
}

/**
 * Change who the agent is. Takes effect on its next observation, including in
 * sessions that are live right now. Past notes are left as they were written.
 */
export async function updateAgent(
  d: Deps,
  ownerId: UserId,
  agentId: string,
  input: AgentInput,
): Promise<Agent> {
  const agent = await ownedAgent(d, ownerId, agentId);
  const updated: Agent = { ...agent, ...clean(input) };
  await d.repos.agents.save(updated);
  return updated;
}
