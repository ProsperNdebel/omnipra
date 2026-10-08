import {
  ORCHESTRATE_EVERY_SEC,
  sameMemory,
  type AgentAttention,
  type AgentId,
  type AgentMessage,
  type MessageId,
  type SessionContext,
} from "@/core";
import type { Deps } from "./deps";
import { recallMemory } from "./memory";

/** The latest from each room is enough to weigh it; the full history isn't needed. */
const NOTES_PER_ROOM = 10;

/**
 * One agent, many rooms: step back, weigh every room it's in against its owner's
 * goals, decide where attention goes, and say so when that changes or when the
 * rooms start echoing each other. Runs at most once per interval per agent.
 */
export async function orchestrate(
  d: Deps,
  agentId: AgentId,
): Promise<AgentAttention | null> {
  const live = await d.repos.manifestations.contexts({
    agentIds: [agentId],
    status: "live",
  });
  // One room needs no orchestrating.
  if (live.length < 2) return null;
  if (!(await d.repos.attention.claim(agentId, d.now(), ORCHESTRATE_EVERY_SEC)))
    return null;

  const [first] = live;
  const [notes, previous] = await Promise.all([
    d.repos.observations.byManifestations(live.map((c) => c.manifestation.id)),
    d.repos.attention.get(agentId),
  ]);
  const rooms = live.map((c) => ({
    manifestationId: c.manifestation.id,
    eventTitle: c.event.title,
    plan: c.mission.plan ?? [],
    notes: notes
      .filter((n) => n.manifestationId === c.manifestation.id)
      .slice(-NOTES_PER_ROOM),
  }));
  const memories = await recallMemory(
    d,
    agentId,
    rooms.flatMap((r) => r.notes.map((n) => n.text)).join(" "),
  );
  const out = await d.agent.orchestrate({
    agent: first!.agent,
    memories,
    rooms,
    previous,
  });

  // A pattern has to span rooms, or it isn't one.
  const roomOf = new Map(notes.map((n) => [n.id, n.manifestationId]));
  const pattern =
    out.pattern &&
    new Set(out.pattern.evidence.map((e) => roomOf.get(e)).filter(Boolean))
      .size >= 2
      ? out.pattern
      : null;

  const state: AgentAttention = {
    agentId,
    rooms: out.rooms,
    focus: out.focus,
    pattern,
    updatedAt: d.now(),
  };
  await d.repos.attention.save(state);

  // Speak up only when something changed: a new focus, or a new pattern.
  const say: AgentMessage[] = [];
  const at = (id: string) => live.find((c) => c.manifestation.id === id);
  if (
    state.focus &&
    state.focus.manifestationId !== previous?.focus?.manifestationId
  ) {
    const ctx = at(state.focus.manifestationId);
    if (ctx)
      say.push(line(d, ctx, `Prioritizing this room. ${state.focus.why}`));
  }
  if (
    pattern &&
    !(previous?.pattern && sameMemory(previous.pattern.text, pattern.text))
  ) {
    const ctx = at(roomOf.get(pattern.evidence[0]!)!) ?? first!;
    say.push(line(d, ctx, `Across my rooms: ${pattern.text}`));
  }
  await d.repos.messages.append(say);
  return state;
}

function line(d: Deps, ctx: SessionContext, text: string): AgentMessage {
  return {
    id: d.newId() as MessageId,
    manifestationId: ctx.manifestation.id,
    agentId: ctx.agent.id,
    from: "agent",
    kind: "nudge",
    text,
    atSec: null,
    createdAt: d.now(),
  };
}
