import {
  checkSuggestion,
  sameMemory,
  type ManifestationId,
  type Suggestion,
  type SuggestionId,
} from "@/core";
import { loadContext, type Deps } from "./deps";
import { recentActions } from "./act";
import { recallMemory } from "./memory";
import { withTitles } from "./notes";

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
  const [memories, recalled, existing, done] = await Promise.all([
    recallMemory(d, ctx.agent.id, query),
    d.memory.recall(ctx.agent.id, query, EARLIER_NOTES * 2),
    d.repos.suggestions.byAgent(ctx.agent.id),
    recentActions(d, ctx.agent.id),
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
    recentActions: done,
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
