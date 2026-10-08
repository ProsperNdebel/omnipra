import { currentAttention, type Agent, type AgentAttention } from "@/core";
import { withTitles, type Deps } from "@/pipeline";
import type { SuggestionSource } from "./suggestions";

export interface AttentionView extends AgentAttention {
  patternSources: SuggestionSource[];
}

/** How the agent is dividing itself across its rooms right now, if it is in several. */
export async function agentAttention(
  d: Deps,
  agent: Agent,
): Promise<AttentionView | null> {
  const a = currentAttention(await d.repos.attention.get(agent.id), d.now());
  if (!a) return null;
  const notes = a.pattern
    ? await withTitles(d, await d.repos.observations.byIds(a.pattern.evidence))
    : [];
  return {
    ...a,
    patternSources: notes.map((n) => ({
      noteId: n.note.id,
      sessionId: n.note.manifestationId,
      eventTitle: n.eventTitle,
      atSec: n.note.atSec,
    })),
  };
}
