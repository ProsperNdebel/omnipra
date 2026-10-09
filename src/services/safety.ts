import {
  DomainError,
  type AuditAction,
  type AuditEntry,
  type ManifestationId,
  type UserId,
} from "@/core";
import { applyTransition, record, recordSession, type Deps } from "@/pipeline";
import { access } from "./access";

/**
 * Flag a session for review. Either side can. Hosts can also block the owner in the
 * same step, so one bad experience never repeats.
 */
export async function reportSession(
  d: Deps,
  viewer: UserId,
  manifestationId: string,
  input: { reason: string; block?: boolean },
): Promise<void> {
  const a = await access(d, manifestationId as ManifestationId, viewer);
  const reason = input.reason.trim().slice(0, 2000);
  if (reason.length < 5)
    throw new DomainError("bad_request", "Say what happened, in a sentence.");
  await d.repos.reports.save({
    id: d.newId(),
    reporterId: viewer,
    manifestationId: a.manifestation.id,
    agentId: a.agent.id,
    reason,
    createdAt: d.now(),
  });
  // Recorded for the reporter only: the other side isn't told who reported what.
  await record(d, {
    actorId: viewer,
    action: "report.filed",
    subject: { kind: "session", id: a.manifestation.id },
    involved: [viewer],
    detail: reason.slice(0, 200),
  });
  if (input.block && a.isHost) await blockOwnerOf(d, viewer, manifestationId);
}

/** The host of a session stops that agent's owner from booking them again. */
export async function blockOwnerOf(
  d: Deps,
  hostId: UserId,
  manifestationId: string,
): Promise<void> {
  const a = await access(d, manifestationId as ManifestationId, hostId);
  if (!a.isHost)
    throw new DomainError("forbidden", "Only the host can block from here.");
  const ownerId = a.agent.ownerId;
  if (ownerId === hostId) return;
  await d.repos.blocks.save({ hostId, ownerId, createdAt: d.now() });
  await record(d, {
    actorId: hostId,
    action: "user.blocked",
    subject: { kind: "user", id: ownerId },
    involved: [hostId],
    detail: `The owner of ${a.agent.name}`,
  });
  // Anything still waiting on this host from them is declined.
  const pending = await d.repos.manifestations.contexts({
    endpointIds: (await d.repos.endpoints.byHost(hostId)).map((e) => e.id),
    status: "requested",
  });
  for (const c of pending.filter((c) => c.agent.ownerId === ownerId)) {
    await applyTransition(d, c.manifestation.id, "decline").catch(() => {});
    await recordSession(d, c, hostId, "session.decline", "Blocked.");
  }
}

export async function unblock(
  d: Deps,
  hostId: UserId,
  ownerId: string,
): Promise<void> {
  await d.repos.blocks.remove(hostId, ownerId as UserId);
  await record(d, {
    actorId: hostId,
    action: "user.unblocked",
    subject: { kind: "user", id: ownerId },
    involved: [hostId],
  });
}

/** Who a host has blocked, named by the agents those owners have. */
export async function hostBlocks(d: Deps, hostId: UserId) {
  const blocks = await d.repos.blocks.byHost(hostId);
  return Promise.all(
    blocks.map(async (b) => ({
      ownerId: b.ownerId,
      since: b.createdAt,
      agents: (await d.repos.agents.byOwner(b.ownerId)).map((a) => a.name),
    })),
  );
}

const WORDS: Record<AuditAction, string> = {
  "session.requested": "Requested a host",
  "session.accept": "Host accepted",
  "session.decline": "Host declined",
  "session.cancel": "Owner cancelled",
  "session.start": "Session started (recording confirmed)",
  "session.end": "Session ended",
  "session.stop": "Emergency stop",
  "session.abandoned": "Ended automatically",
  "request.sent": "Ask sent to the host",
  "request.declined": "Host declined an ask",
  "device.added": "Device added",
  "device.disconnected": "Device disconnected",
  "key.created": "API key made",
  "key.revoked": "API key revoked",
  "user.blocked": "Blocked",
  "user.unblocked": "Unblocked",
  "report.filed": "Report filed",
};

export interface ActivityRow {
  id: string;
  at: string;
  what: string;
  /** "you", "the host", "the owner", or "Omnipra". */
  who: string;
  /** What it was about, like "Scout at Demo day". */
  about: string | null;
  detail: string | null;
  href: string | null;
}

/** The account's record of what happened, in plain words. */
export async function activity(
  d: Deps,
  viewer: UserId,
  limit = 100,
): Promise<ActivityRow[]> {
  const entries = await d.repos.audit.forUser(viewer, limit);
  const sessionIds = [
    ...new Set(
      entries
        .filter((e) => e.subject.kind === "session")
        .map((e) => e.subject.id as ManifestationId),
    ),
  ];
  const sessions = new Map(
    (await d.repos.manifestations.contexts({ ids: sessionIds })).map((c) => [
      c.manifestation.id as string,
      c,
    ]),
  );
  return entries.map((e: AuditEntry) => {
    const s = e.subject.kind === "session" ? sessions.get(e.subject.id) : null;
    const who =
      e.actorId === null
        ? "Omnipra"
        : e.actorId === viewer
          ? "You"
          : s && e.actorId === s.endpoint.hostId
            ? "The host"
            : s && e.actorId === s.agent.ownerId
              ? "The owner"
              : "Someone";
    return {
      id: e.id,
      at: e.at,
      what: WORDS[e.action] ?? e.action,
      who,
      about: s ? `${s.agent.name} at ${s.event.title}` : null,
      detail: e.detail,
      href: s
        ? s.agent.ownerId === viewer
          ? `/m/${s.manifestation.id}`
          : `/host/${s.manifestation.id}`
        : null,
    };
  });
}
