import { DomainError, type ManifestationId, type UserId } from "@/core";
import { recordSession, type Deps } from "@/pipeline";
import { access } from "./access";

/**
 * The host stops listening for a while (a private conversation, a break) and picks up
 * again later. The session stays live; the owner sees it's paused, and a pause isn't
 * mistaken for the phone going quiet.
 */
export async function setPaused(
  d: Deps,
  id: ManifestationId,
  viewer: UserId,
  paused: boolean,
): Promise<void> {
  const a = await access(d, id, viewer);
  if (!a.isHost)
    throw new DomainError("forbidden", "Only the host can pause or resume listening.");
  if (a.manifestation.status !== "live")
    throw new DomainError("bad_request", "The session isn't live.");
  if (!!a.manifestation.pausedAt === paused) return;
  const now = d.now();
  await d.repos.manifestations.paused(id, paused ? now : null);
  // Picking up again counts as hearing from the phone, so the quiet clock restarts.
  if (!paused) await d.repos.manifestations.heard(id, now);
  await recordSession(d, a, viewer, paused ? "session.pause" : "session.resume");
}
