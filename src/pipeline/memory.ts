import {
  memoryInUse,
  newMemory,
  sameMemory,
  type AgentId,
  type AgentMemory,
  type HeardWorthRemembering,
  type LearnedFromOwner,
  type ManifestationId,
  type MemoryId,
} from "@/core";
import type { Deps } from "./deps";

/** A model proposing more than this in one go is padding, not learning. */
const MAX_LEARNED_AT_ONCE = 2;
const MAX_HEARD_AT_ONCE = 3;

/** The memories the agent reasons with right now, given what the moment is about. */
export async function recallMemory(
  d: Deps,
  agentId: AgentId,
  query: string,
): Promise<AgentMemory[]> {
  return memoryInUse(await d.repos.memories.byAgent(agentId), query);
}

/**
 * The owner said something worth keeping. Saved as a proposal: the agent's reading
 * of what they said might be off, so the owner confirms or corrects it first.
 */
export async function proposeLearned(
  d: Deps,
  agentId: AgentId,
  learned: LearnedFromOwner[],
  said: { manifestationId: ManifestationId | null; quote: string },
): Promise<AgentMemory[]> {
  return propose(
    d,
    agentId,
    learned.slice(0, MAX_LEARNED_AT_ONCE).map((l) => ({
      kind: l.kind,
      text: l.text,
      source: { type: "said", ...said, quote: said.quote.slice(0, 500) },
    })),
  );
}

/** Things heard in a room the agent thinks are worth keeping. Always experiences, always proposals. */
export async function proposeHeard(
  d: Deps,
  agentId: AgentId,
  manifestationId: ManifestationId,
  heard: HeardWorthRemembering[],
): Promise<AgentMemory[]> {
  return propose(
    d,
    agentId,
    heard.slice(0, MAX_HEARD_AT_ONCE).map((h) => ({
      kind: "experience",
      text: h.text,
      source: {
        type: "heard",
        manifestationId,
        observationIds: h.evidence,
      },
    })),
  );
}

async function propose(
  d: Deps,
  agentId: AgentId,
  candidates: Pick<AgentMemory, "kind" | "text" | "source">[],
): Promise<AgentMemory[]> {
  if (candidates.length === 0) return [];
  const existing = await d.repos.memories.byAgent(agentId);
  const fresh: AgentMemory[] = [];
  for (const c of candidates) {
    const known = [...existing, ...fresh].some((m) =>
      sameMemory(m.text, c.text),
    );
    if (known) continue;
    try {
      fresh.push(
        newMemory({ ...c, id: d.newId() as MemoryId, agentId }, d.now()),
      );
    } catch {
      // A malformed proposal (empty, too long, wrong kind for its source) is dropped, not fatal.
    }
  }
  await d.repos.memories.save(fresh);
  return fresh;
}
