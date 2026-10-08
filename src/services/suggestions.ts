import {
  DomainError,
  resolveSuggestion,
  type Agent,
  type ManifestationId,
  type ObservationId,
  type Suggestion,
  type SuggestionId,
  type UserId,
} from "@/core";
import { draftFor, withTitles, type Deps } from "@/pipeline";
import { ownedAgent } from "./agents";
import { addMemory } from "./memory";

/** Where a suggestion's evidence was heard, so each claim is one click from its note. */
export interface SuggestionSource {
  noteId: ObservationId;
  sessionId: ManifestationId;
  eventTitle: string;
  atSec: number | null;
}

export interface SuggestionView extends Suggestion {
  sources: SuggestionSource[];
}

/** Drafts stay on the page for a while after they're written, to copy. */
const RECENT_DRAFTS = 3;

export async function agentSuggestions(
  d: Deps,
  agent: Agent,
): Promise<{ open: SuggestionView[]; drafted: SuggestionView[] }> {
  const all = await d.repos.suggestions.byAgent(agent.id);
  const open = all.filter((s) => s.status === "open");
  const drafted = all
    .filter((s) => s.status === "accepted" && s.draft)
    .slice(0, RECENT_DRAFTS);
  const shown = [...open, ...drafted];
  const notes = await withTitles(
    d,
    await d.repos.observations.byIds([
      ...new Set(shown.flatMap((s) => s.evidence)),
    ]),
  );
  const byId = new Map(notes.map((n) => [n.note.id, n]));
  const view = (s: Suggestion): SuggestionView => ({
    ...s,
    sources: s.evidence.flatMap((id) => {
      const n = byId.get(id);
      return n
        ? [
            {
              noteId: id,
              sessionId: n.note.manifestationId,
              eventTitle: n.eventTitle,
              atSec: n.note.atSec,
            },
          ]
        : [];
    }),
  });
  return { open: open.map(view), drafted: drafted.map(view) };
}

/**
 * The owner takes the agent up on a suggestion, or waves it off. Taking an intro or
 * message writes the draft; taking "watch" turns it into a standing goal.
 */
export async function actOnSuggestion(
  d: Deps,
  ownerId: UserId,
  suggestionId: string,
  op: "accept" | "dismiss",
): Promise<Suggestion> {
  const s = await d.repos.suggestions.get(suggestionId as SuggestionId);
  if (!s) throw new DomainError("not_found", "That suggestion is gone.");
  const agent = await ownedAgent(d, ownerId, s.agentId);

  let draft: string | null = null;
  if (op === "accept" && (s.offer === "intro" || s.offer === "message")) {
    draft = await draftFor(d, s);
  }
  if (op === "accept" && s.offer === "watch") {
    await addMemory(d, ownerId, agent.id, { kind: "goal", text: s.text });
  }
  const next = resolveSuggestion(s, op, d.now(), draft);
  await d.repos.suggestions.save([next]);
  return next;
}
