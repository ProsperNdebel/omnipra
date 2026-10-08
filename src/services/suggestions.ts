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
import { prepareActions, withTitles, type Deps } from "@/pipeline";
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

export async function agentSuggestions(
  d: Deps,
  agent: Agent,
): Promise<SuggestionView[]> {
  const all = await d.repos.suggestions.byAgent(agent.id);
  const open = all.filter((s) => s.status === "open");
  const shown = open;
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
  return open.map(view);
}

/** What each offer turns into when the owner takes it. */
const OFFER_ACTION = {
  intro: "email",
  message: "email",
  contact: "contact",
  task: "task",
} as const;

/**
 * The owner takes the agent up on a suggestion, or waves it off. Taking an intro,
 * message, contact or to do prepares that action for approval; taking "watch"
 * turns it into a standing goal.
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

  if (op === "accept" && s.offer && s.offer !== "watch") {
    const kind = OFFER_ACTION[s.offer];
    await prepareActions(
      d,
      agent.id,
      [
        {
          kind,
          instruction:
            s.offer === "intro"
              ? `Draft an introduction: ${s.text} ${s.why}`
              : `${s.text} ${s.why}`,
          target: s.target,
        },
      ],
      { type: "suggestion", suggestionId: s.id },
      s.evidence,
    );
  }
  if (op === "accept" && s.offer === "watch") {
    await addMemory(d, ownerId, agent.id, { kind: "goal", text: s.text });
  }
  const next = resolveSuggestion(s, op, d.now());
  await d.repos.suggestions.save([next]);
  return next;
}
