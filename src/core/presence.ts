import {
  DomainError,
  type AgentId,
  type HostRequestId,
  type ISODate,
  type ManifestationId,
  type MessageId,
} from "./ids";

/**
 * What makes a session presence rather than a recording: the agent talks to its
 * owner while it's there, and can act through its host.
 */

/** One line in the conversation around a live session. */
export interface AgentMessage {
  id: MessageId;
  manifestationId: ManifestationId;
  agentId: AgentId;
  /** agent: the agent speaking; owner: its owner; host: something the host reported. */
  from: "agent" | "owner" | "host";
  /**
   * nudge: the agent interrupting because something matters right now.
   * chat: conversation. update: a status line (a request was answered, orders changed).
   */
  kind: "nudge" | "chat" | "update";
  text: string;
  /** Seconds into the session when it happened, if tied to something said. */
  atSec: number | null;
  createdAt: ISODate;
}

/**
 * How much the agent may do on its own in this session.
 * ask_first: it proposes asks for the host and the owner approves each one.
 * act: approved in advance; its asks go straight to the host.
 */
export type Autonomy = "ask_first" | "act";
export const AUTONOMY: readonly Autonomy[] = ["ask_first", "act"];

/** Something the agent wants the host to do in the room, like ask the speaker a question. */
export interface HostRequest {
  id: HostRequestId;
  manifestationId: ManifestationId;
  agentId: AgentId;
  /** What the host sees, written to them. */
  ask: string;
  /** Why it matters, for the owner. Never shown to the host. */
  why: string;
  /** Who started it: the agent noticing something, or the owner telling it to. */
  origin: "agent" | "owner";
  status: HostRequestStatus;
  /** What the host reported back, if anything. */
  hostNote: string | null;
  createdAt: ISODate;
  sentAt: ISODate | null;
  resolvedAt: ISODate | null;
}

/**
 * proposed: the agent wants it, the owner hasn't approved. sent: with the host.
 * accepted: the host said they'll do it. done / declined: the host's answer.
 * dismissed: the owner dropped it.
 */
export type HostRequestStatus =
  "proposed" | "dismissed" | "sent" | "accepted" | "done" | "declined";

export type HostRequestEvent =
  "send" | "dismiss" | "accept" | "done" | "decline";

const REQUEST_TRANSITIONS: Record<
  HostRequestStatus,
  Partial<Record<HostRequestEvent, HostRequestStatus>>
> = {
  proposed: { send: "sent", dismiss: "dismissed" },
  sent: { accept: "accepted", done: "done", decline: "declined" },
  accepted: { done: "done", decline: "declined" },
  dismissed: {},
  done: {},
  declined: {},
};

/** Who may move a request: the owner decides what goes out, the host decides what gets done. */
export const REQUEST_ROLE: Record<HostRequestEvent, "owner" | "host"> = {
  send: "owner",
  dismiss: "owner",
  accept: "host",
  done: "host",
  decline: "host",
};

/** Pure. The only way a request changes status. */
export function transitionRequest(
  r: HostRequest,
  event: HostRequestEvent,
  now: ISODate,
  input: { ask?: string; hostNote?: string } = {},
): HostRequest {
  const next = REQUEST_TRANSITIONS[r.status][event];
  if (!next) {
    throw new DomainError(
      "invalid_transition",
      `cannot ${event} a request that is ${r.status}`,
    );
  }
  const ask = input.ask?.trim();
  if (event === "send" && ask !== undefined && !ask) {
    throw new DomainError("bad_request", "The request can't be empty.");
  }
  return {
    ...r,
    status: next,
    ask: event === "send" && ask ? ask : r.ask,
    hostNote:
      event === "done" || event === "decline"
        ? input.hostNote?.trim() || null
        : r.hostNote,
    sentAt: event === "send" ? now : r.sentAt,
    resolvedAt: event === "done" || event === "decline" ? now : r.resolvedAt,
  };
}

/** Requests the host should currently see and act on. */
export const isOpenForHost = (r: Pick<HostRequest, "status">) =>
  r.status === "sent" || r.status === "accepted";
