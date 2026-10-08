import {
  DomainError,
  type ActionId,
  type AgentId,
  type ISODate,
  type ManifestationId,
  type ObservationId,
  type SuggestionId,
} from "./ids";

/**
 * Something the agent does in the world for its owner, always with their approval.
 * The payload is the whole action: everything needed to carry it out, which the
 * owner can read and edit before it goes.
 */
export type ActionPayload =
  | { kind: "email"; to: string; subject: string; body: string }
  | {
      kind: "event";
      title: string;
      /** ISO start, or null when the owner still has to pick a time. */
      start: string | null;
      durationMin: number;
      details: string;
    }
  | {
      kind: "contact";
      name: string;
      company: string;
      role: string;
      email: string;
      notes: string;
    }
  | { kind: "task"; text: string; due: string | null }
  | { kind: "note"; title: string; body: string };

export type ActionKind = ActionPayload["kind"];
export const ACTION_KINDS: readonly ActionKind[] = [
  "email",
  "event",
  "contact",
  "task",
  "note",
];

/** Why the agent is doing this: following up on its own suggestion, or because its owner said so. */
export type ActionOrigin =
  | { type: "suggestion"; suggestionId: SuggestionId }
  | { type: "owner"; quote: string; manifestationId: ManifestationId | null };

/**
 * proposed: prepared, waiting for the owner.
 * active: approved and ongoing (a to do on the list).
 * done: carried out. dismissed: the owner said no.
 */
export type ActionStatus = "proposed" | "active" | "done" | "dismissed";

export interface Action {
  id: ActionId;
  agentId: AgentId;
  payload: ActionPayload;
  /** Why it matters to the owner, in a sentence. */
  why: string;
  /** Notes it rests on, so the owner can check what an email claims. */
  evidence: ObservationId[];
  origin: ActionOrigin;
  status: ActionStatus;
  /** How it was carried out, in words ("opened in your mail app"). The record the agent remembers. */
  how: string | null;
  createdAt: ISODate;
  doneAt: ISODate | null;
}

/** One line for lists and for the agent's own record of what it has done. */
export function describeAction(p: ActionPayload): string {
  switch (p.kind) {
    case "email":
      return `Email${p.to ? ` to ${p.to}` : ""}: ${p.subject}`;
    case "event":
      return `Calendar invite: ${p.title}`;
    case "contact":
      return `Contact: ${p.name}${p.company ? `, ${p.company}` : ""}`;
    case "task":
      return `To do: ${p.text}`;
    case "note":
      return `Note: ${p.title}`;
  }
}

const LIMIT = 5000;
const clip = (s: unknown, n = 300) =>
  (typeof s === "string" ? s : "").trim().slice(0, n);

/** Pure. Coerces whatever came in (model output or a form) into a valid payload of a given kind. */
export function cleanPayload(
  kind: ActionKind,
  raw: Record<string, unknown>,
): ActionPayload {
  const p = (() => {
    switch (kind) {
      case "email":
        return {
          kind,
          to: clip(raw.to, 200),
          subject: clip(raw.subject, 200),
          body: clip(raw.body, LIMIT),
        } as const;
      case "event": {
        const start = clip(raw.start, 40);
        const minutes = Number(raw.durationMin);
        return {
          kind,
          title: clip(raw.title, 200),
          start:
            start && !isNaN(Date.parse(start))
              ? new Date(start).toISOString()
              : null,
          durationMin:
            Number.isFinite(minutes) && minutes > 0
              ? Math.min(minutes, 600)
              : 30,
          details: clip(raw.details, LIMIT),
        } as const;
      }
      case "contact":
        return {
          kind,
          name: clip(raw.name, 120),
          company: clip(raw.company, 120),
          role: clip(raw.role, 120),
          email: clip(raw.email, 200),
          notes: clip(raw.notes, LIMIT),
        } as const;
      case "task": {
        const due = clip(raw.due, 40);
        return {
          kind,
          text: clip(raw.text, 300),
          due:
            due && !isNaN(Date.parse(due)) ? new Date(due).toISOString() : null,
        } as const;
      }
      case "note":
        return {
          kind,
          title: clip(raw.title, 200),
          body: clip(raw.body, LIMIT),
        } as const;
    }
  })();
  const main =
    p.kind === "email"
      ? p.body
      : p.kind === "event"
        ? p.title
        : p.kind === "contact"
          ? p.name
          : p.kind === "task"
            ? p.text
            : p.body;
  if (!main) throw new DomainError("bad_request", "That action is empty.");
  return p;
}

/**
 * Pure. The owner decides: approve (a task goes on the list; anything else is carried
 * out, and `how` records the way), complete an active task, or dismiss.
 */
export function decideAction(
  a: Action,
  op: "approve" | "complete" | "dismiss",
  now: ISODate,
  how: string | null = null,
): Action {
  const ok =
    (op === "complete" && (a.status === "active" || a.status === "proposed")) ||
    (op !== "complete" && a.status === "proposed");
  if (!ok)
    throw new DomainError("invalid_transition", `That is already ${a.status}.`);
  if (op === "dismiss") return { ...a, status: "dismissed", doneAt: now };
  if (op === "approve" && a.payload.kind === "task")
    return { ...a, status: "active", how: "added to your to do list" };
  return { ...a, status: "done", how: how ?? a.how ?? "done", doneAt: now };
}
