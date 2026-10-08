import {
  checkSuggestion,
  sameMemory,
  type ManifestationId,
  type NoteInContext,
  type Observation,
  type Suggestion,
  type SuggestionId,
} from "@/core";
import { loadContext, type Deps } from "./deps";
import { recallMemory } from "./memory";

/** How much from earlier events the agent looks back over. */
const EARLIER_NOTES = 20;

/**
 * After an event: look across it and everything heard before, and suggest what the
 * owner should do. Only suggestions backed by notes survive, and a "connection" has
 * to span two events.
 */
export async function reflect(
  d: Deps,
  id: ManifestationId,
): Promise<Suggestion[]> {
  const ctx = await loadContext(d, id);
  const notes = await d.repos.observations.byManifestation(id);
  if (notes.length === 0) return [];

  const query = notes.map((n) => n.text).join(" ");
  const [memories, recalled, existing] = await Promise.all([
    recallMemory(d, ctx.agent.id, query),
    d.memory.recall(ctx.agent.id, query, EARLIER_NOTES * 2),
    d.repos.suggestions.byAgent(ctx.agent.id),
  ]);
  const earlier = await withTitles(
    d,
    recalled.filter((o) => o.manifestationId !== id).slice(0, EARLIER_NOTES),
  );
  const open = existing.filter((s) => s.status === "open");

  const proposed = await d.agent.reflect({
    agent: ctx.agent,
    memories,
    event: ctx.event,
    notes,
    earlier,
    open,
  });

  const sessionOf = new Map(
    [...notes, ...earlier.map((e) => e.note)].map((o) => [
      o.id,
      o.manifestationId,
    ]),
  );
  const fresh: Suggestion[] = [];
  for (const p of proposed) {
    const checked = checkSuggestion(p, (e) => sessionOf.get(e));
    if (!checked) continue;
    if ([...existing, ...fresh].some((s) => sameMemory(s.text, p.text)))
      continue;
    fresh.push({
      ...p,
      ...checked,
      id: d.newId() as SuggestionId,
      agentId: ctx.agent.id,
      manifestationId: id,
      status: "open",
      draft: null,
      createdAt: d.now(),
      resolvedAt: null,
    });
  }
  await d.repos.suggestions.save(fresh);
  return fresh;
}

/** Write the intro or message a suggestion offered, from the notes behind it. */
export async function draftFor(d: Deps, s: Suggestion): Promise<string> {
  const agent = await d.repos.agents.get(s.agentId);
  if (!agent) throw new Error("agent not found");
  const notes = await withTitles(
    d,
    await d.repos.observations.byIds(s.evidence),
  );
  const memories = await recallMemory(d, agent.id, s.text);
  return d.agent.draft({ agent, memories, suggestion: s, notes });
}

/** Attach the event each note was heard at. One query. */
export async function withTitles(
  d: Deps,
  notes: Observation[],
): Promise<NoteInContext[]> {
  const ids = [...new Set(notes.map((n) => n.manifestationId))];
  const contexts = ids.length
    ? await d.repos.manifestations.contexts({ ids })
    : [];
  const title = new Map(
    contexts.map((c) => [c.manifestation.id, c.event.title]),
  );
  return notes.map((note) => ({
    note,
    eventTitle: title.get(note.manifestationId) ?? "an event",
  }));
}
