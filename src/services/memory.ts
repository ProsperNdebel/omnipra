import {
  DomainError,
  MEMORY_KINDS,
  newMemory,
  reviseMemory,
  type Agent,
  type AgentMemory,
  type ManifestationId,
  type MemoryId,
  type MemoryKind,
  type UserId,
} from "@/core";
import type { Deps } from "@/pipeline";
import { ownedAgent } from "./agents";

/** A memory with where it came from, in words the owner recognises. */
export interface MemoryView extends AgentMemory {
  /** The session it came from, if any. */
  from: { sessionId: ManifestationId; eventTitle: string } | null;
}

export interface AgentMemoryView {
  /** Waiting on the owner. */
  proposed: MemoryView[];
  /** In use, by kind, newest first. */
  active: Record<MemoryKind, MemoryView[]>;
}

/** Everything the agent knows, for its owner to read, correct and prune. */
export async function agentMemory(
  d: Deps,
  agent: Agent,
): Promise<AgentMemoryView> {
  const all = await d.repos.memories.byAgent(agent.id);
  const sessionIds = [
    ...new Set(
      all.flatMap((m) =>
        m.source.type !== "owner" && m.source.manifestationId
          ? [m.source.manifestationId]
          : [],
      ),
    ),
  ];
  const contexts = sessionIds.length
    ? await d.repos.manifestations.contexts({ ids: sessionIds })
    : [];
  const titles = new Map(
    contexts.map((c) => [c.manifestation.id, c.event.title]),
  );
  const view = (m: AgentMemory): MemoryView => {
    const id = m.source.type !== "owner" ? m.source.manifestationId : null;
    const title = id ? titles.get(id) : undefined;
    return {
      ...m,
      from: id && title ? { sessionId: id, eventTitle: title } : null,
    };
  };

  const newestFirst = [...all].reverse().map(view);
  const active = Object.fromEntries(
    MEMORY_KINDS.map((k) => [
      k,
      newestFirst.filter((m) => m.status === "active" && m.kind === k),
    ]),
  ) as Record<MemoryKind, MemoryView[]>;
  return {
    proposed: newestFirst.filter((m) => m.status === "proposed"),
    active,
  };
}

/** The owner tells the agent something directly. Trusted, so it is used at once. */
export async function addMemory(
  d: Deps,
  ownerId: UserId,
  agentId: string,
  input: { kind: string; text: string },
): Promise<AgentMemory> {
  const agent = await ownedAgent(d, ownerId, agentId);
  const kind = MEMORY_KINDS.find((k) => k === input.kind);
  if (!kind)
    throw new DomainError("bad_request", "Pick what kind of memory this is.");
  const m = newMemory(
    {
      id: d.newId() as MemoryId,
      agentId: agent.id,
      kind,
      text: input.text,
      source: { type: "owner" },
    },
    d.now(),
  );
  await d.repos.memories.save([m]);
  return m;
}

export type MemoryReview = "keep" | "edit" | "forget";

/** Keep a proposal, correct a memory's wording, or make the agent forget it. */
export async function reviewMemory(
  d: Deps,
  ownerId: UserId,
  memoryId: string,
  op: MemoryReview,
  text?: string,
): Promise<void> {
  const m = await d.repos.memories.get(memoryId as MemoryId);
  if (!m) throw new DomainError("not_found", "That memory is already gone.");
  await ownedAgent(d, ownerId, m.agentId);
  if (op === "forget") return d.repos.memories.remove(m.id);
  await d.repos.memories.save([reviseMemory(m, op, d.now(), text)]);
}
