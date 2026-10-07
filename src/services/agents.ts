import { DomainError, LOOK_FOR, type Agent, type AgentId, type LookFor, type UserId } from "@/core";
import type { Deps } from "@/pipeline";

/** One agent per owner for the MVP. The model allows more; the UI doesn't ask for it yet. */
export async function ownerAgent(d: Deps, ownerId: UserId): Promise<Agent | null> {
  return (await d.repos.agents.byOwner(ownerId))[0] ?? null;
}

export async function createAgent(
  d: Deps,
  ownerId: UserId,
  input: { name: string; profile: string; lookFor: string[] },
): Promise<Agent> {
  const existing = await ownerAgent(d, ownerId);
  if (existing) return existing;

  const name = input.name.trim();
  if (!name) throw new DomainError("bad_request", "Give your agent a name.");
  if (!input.profile.trim()) throw new DomainError("bad_request", "Tell your agent what you care about.");

  const agent: Agent = {
    id: d.newId() as AgentId,
    ownerId,
    name: name.slice(0, 60),
    profile: input.profile.trim(),
    lookFor: input.lookFor.filter((x): x is LookFor => (LOOK_FOR as readonly string[]).includes(x)),
    provider: "native",
    createdAt: d.now(),
  };
  await d.repos.agents.save(agent);
  return agent;
}
