import {
  type Encounter,
  type EncounterId,
  type ManifestationId,
  type SessionContext,
} from "@/core";
import { loadContext, type Deps } from "./deps";
import { recallMemory } from "./memory";

/** Sessions where an agent is, or was, actually in the room. */
const PRESENT = new Set(["live", "ended", "briefed"]);

/**
 * An agent arrives somewhere: meet every other person's agent there that is also open
 * to meeting. Each side reads only the other's card and judges for its own owner.
 * An encounter is kept only when at least one side thinks it's worth an introduction.
 */
export async function meetOthers(
  d: Deps,
  id: ManifestationId,
): Promise<Encounter[]> {
  const ctx = await loadContext(d, id);
  if (!ctx.agent.card) return [];

  const here = await d.repos.manifestations.contexts({
    eventIds: [ctx.event.id],
  });
  // One entry per other agent, of a different owner, open to meeting, actually present.
  const others = new Map<string, SessionContext>();
  for (const c of here) {
    if (
      c.agent.id !== ctx.agent.id &&
      c.agent.ownerId !== ctx.agent.ownerId &&
      c.agent.card &&
      PRESENT.has(c.manifestation.status)
    )
      others.set(c.agent.id, c);
  }

  const met: Encounter[] = [];
  for (const other of others.values()) {
    if (
      await d.repos.encounters.exists(
        ctx.event.id,
        ctx.agent.id,
        other.agent.id,
      )
    )
      continue;
    const [mine, theirs] = await Promise.all([
      judge(d, ctx, other),
      judge(d, other, ctx),
    ]);
    if (!mine.relevant && !theirs.relevant) continue;
    const e: Encounter = {
      id: d.newId() as EncounterId,
      eventId: ctx.event.id,
      eventTitle: ctx.event.title,
      sides: [
        {
          agentId: ctx.agent.id,
          metName: other.agent.card!.name,
          metAbout: other.agent.card!.about,
          ...mine,
          answer: "pending",
        },
        {
          agentId: other.agent.id,
          metName: ctx.agent.card.name,
          metAbout: ctx.agent.card.about,
          ...theirs,
          answer: "pending",
        },
      ],
      status: "open",
      createdAt: d.now(),
      resolvedAt: null,
    };
    await d.repos.encounters.save(e);
    met.push(e);
  }
  return met;
}

/** One agent's read of another, from the other's card alone. */
async function judge(d: Deps, me: SessionContext, them: SessionContext) {
  const card = them.agent.card!;
  const memories = await recallMemory(d, me.agent.id, card.about);
  return d.agent.assess({
    agent: me.agent,
    memories,
    event: me.event,
    other: { name: card.name, about: card.about },
  });
}
