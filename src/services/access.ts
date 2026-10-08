import {
  DomainError,
  type ManifestationEvent,
  type ManifestationId,
  type UserId,
} from "@/core";
import { loadContext, type Deps, type ManifestationContext } from "@/pipeline";

export interface Access extends ManifestationContext {
  isOwner: boolean;
  isHost: boolean;
}

/** Who the viewer is to this manifestation. Owner sees everything; host sees only what they need. */
export async function access(
  d: Deps,
  id: ManifestationId,
  viewer: UserId,
): Promise<Access> {
  const ctx = await loadContext(d, id);
  const isOwner = ctx.agent.ownerId === viewer;
  const isHost = ctx.endpoint.hostId === viewer;
  if (!isOwner && !isHost)
    throw new DomainError("forbidden", "Not your session.");
  return { ...ctx, isOwner, isHost };
}

/** The host runs the session; the owner can only withdraw a request. */
const ROLE: Record<ManifestationEvent, "host" | "owner" | "system"> = {
  accept: "host",
  decline: "host",
  start: "host",
  end: "host",
  cancel: "owner",
  brief: "system",
};

export async function authorizeTransition(
  d: Deps,
  id: ManifestationId,
  viewer: UserId,
  event: ManifestationEvent,
): Promise<void> {
  const a = await access(d, id, viewer);
  const role = ROLE[event];
  if (
    (role === "host" && !a.isHost) ||
    (role === "owner" && !a.isOwner) ||
    role === "system"
  ) {
    throw new DomainError("forbidden", `You can't ${event} this session.`);
  }
}
