import type { Capability } from "./endpoint";
import type { AgentId, ISODate, ManifestationId, UserId } from "./ids";

/**
 * The minimum that lets strangers trust each other: a record of who did what, a way
 * for hosts to refuse someone for good, and a way for anyone to flag a problem.
 */

/** One thing that happened, kept for everyone it involved to see. */
export interface AuditEntry {
  id: string;
  at: ISODate;
  /** Who did it. Null when Omnipra did it (an abandoned session ended, say). */
  actorId: UserId | null;
  action: AuditAction;
  subject: { kind: "session" | "device" | "key" | "user"; id: string };
  /** Everyone who may see this entry: usually the owner and the host. */
  involved: UserId[];
  detail: string | null;
}

export type AuditAction =
  | "session.requested"
  | "session.accept"
  | "session.decline"
  | "session.cancel"
  | "session.start"
  | "session.end"
  | "session.stop"
  | "session.abandoned"
  | "request.sent"
  | "request.declined"
  | "device.added"
  | "device.disconnected"
  | "key.created"
  | "key.revoked"
  | "user.blocked"
  | "user.unblocked"
  | "report.filed";

/** A host refusing an owner's agents from now on. */
export interface Block {
  hostId: UserId;
  ownerId: UserId;
  createdAt: ISODate;
}

/** Someone flagging a session for Omnipra to look at. */
export interface Report {
  id: string;
  reporterId: UserId;
  manifestationId: ManifestationId | null;
  agentId: AgentId | null;
  reason: string;
  createdAt: ISODate;
}

/** What each sensor means for the person carrying it, in their words. */
const SENSOR_WORDS: Record<Capability, string> = {
  mic: "your microphone while the session is open",
  camera: "your camera when you take a photo",
  speaker: "your speaker to talk",
  location: "your location",
  display: "your screen to show things",
};

/** "your microphone while the session is open and your camera when you take a photo" */
export function sensorsInWords(requires: Capability[]): string {
  const list = (requires.length ? requires : (["mic"] as Capability[])).map(
    (c) => SENSOR_WORDS[c],
  );
  return list.length === 1
    ? list[0]!
    : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}
