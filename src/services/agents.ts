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

export async function createAgent(
  d: Deps,
  ownerId: UserId,
  input: { name: string; profile: string; lookFor: string[] },
): Promise<Agent> {
  const name = input.name.trim();
  if (!name) throw new DomainError("bad_request", "Give your agent a name.");
  if (!input.profile.trim()) {
    throw new DomainError("bad_request", "Tell your agent what to care about.");
  }

  const agent: Agent = {
    id: d.newId() as AgentId,
    ownerId,
    name: name.slice(0, 60),
    profile: input.profile.trim(),
    lookFor: input.lookFor.filter((x): x is LookFor =>
      (LOOK_FOR as readonly string[]).includes(x),
    ),
    provider: "native",
    createdAt: d.now(),
  };
  await d.repos.agents.save(agent);
  return agent;
}
