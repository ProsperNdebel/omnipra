import {
  DomainError,
  type AgentId,
  type ISODate,
  type ManifestationId,
  type ObservationId,
  type SuggestionId,
} from "./ids";

/**
 * Something the agent thinks its owner should do, worked out after an event from
 * everything it has heard so far.
 *
 * connection: a pattern across events ("two companies need Shona ASR").
 * follow_up: someone worth contacting.
 * question: something still unanswered worth chasing at the next event.
 */
export type SuggestionKind = "connection" | "follow_up" | "question";

/**
 * What the agent offers to do about it.
 * intro: draft an introduction email. message: draft a follow up email.
 * contact: save someone as a contact. task: add a to do.
 * watch: keep watching for it at future events (becomes a goal).
 */
export type SuggestionOffer =
  "intro" | "message" | "contact" | "task" | "watch";
export const SUGGESTION_OFFERS: readonly SuggestionOffer[] = [
  "intro",
  "message",
  "contact",
  "task",
  "watch",
];

export type SuggestionStatus = "open" | "accepted" | "dismissed";

export interface Suggestion {
  id: SuggestionId;
  agentId: AgentId;
  /** The session whose end prompted it. */
  manifestationId: ManifestationId;
  kind: SuggestionKind;
  /** What the agent noticed, to its owner. */
  text: string;
  /** Why it matters to them, tied to their goals. */
  why: string;
  offer: SuggestionOffer | null;
  /** Who the intro or message is for, as named in the notes. */
  target: string | null;
  /** Notes it rests on, possibly from several events. Never empty. */
  evidence: ObservationId[];
  status: SuggestionStatus;
  /** The drafted intro or message, once the owner asks for it. */
  draft: string | null;
  createdAt: ISODate;
  resolvedAt: ISODate | null;
}

/**
 * The evidence rule. A suggestion with no notes behind it is dropped, and a
 * "connection" must draw on at least two different events, or it is not one.
 */
export function checkSuggestion(
  s: Pick<Suggestion, "kind" | "evidence">,
  sessionOf: (id: ObservationId) => ManifestationId | undefined,
): Pick<Suggestion, "kind" | "evidence"> | null {
  const evidence = s.evidence.filter((e) => sessionOf(e) !== undefined);
  if (evidence.length === 0) return null;
  const sessions = new Set(evidence.map(sessionOf));
  const kind =
    s.kind === "connection" && sessions.size < 2 ? "follow_up" : s.kind;
  return { kind, evidence };
}

/** Pure. accept: the owner took the offer (with a draft when there is one). dismiss: not useful. */
export function resolveSuggestion(
  s: Suggestion,
  op: "accept" | "dismiss",
  now: ISODate,
  draft: string | null = null,
): Suggestion {
  if (s.status !== "open")
    throw new DomainError(
      "invalid_transition",
      "That suggestion is already handled.",
    );
  return {
    ...s,
    status: op === "accept" ? "accepted" : "dismissed",
    draft: op === "accept" ? draft : null,
    resolvedAt: now,
  };
}
