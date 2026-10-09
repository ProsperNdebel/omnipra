import {
  ABANDONED_AFTER_SEC,
  silentForSec,
  type ManifestationId,
  type MessageId,
} from "@/core";
import { recordSession } from "./audit";
import { brief } from "./brief";
import type { Deps } from "./deps";
import { applyTransition } from "./lifecycle";

/**
 * Sessions whose body went silent for good (battery died, tab closed, host walked
 * off) are ended on the host's behalf, so the owner still gets a briefing of what
 * was captured. Safe to run often and from several places: ending is a guarded
 * transition, so only one sweep wins each session.
 */
export async function sweepAbandoned(d: Deps): Promise<ManifestationId[]> {
  const live = await d.repos.manifestations.contexts({ status: "live" });
  const now = d.now();
  const ended: ManifestationId[] = [];
  for (const c of live) {
    const silent = silentForSec(c.manifestation, now);
    if (silent === null || silent < ABANDONED_AFTER_SEC) continue;
    try {
      await applyTransition(d, c.manifestation.id, "end");
      ended.push(c.manifestation.id);
      await recordSession(
        d,
        c,
        null,
        "session.abandoned",
        `No audio or photos for ${Math.round(silent / 60)} minutes.`,
      );
      await d.repos.messages.append([
        {
          id: d.newId() as MessageId,
          manifestationId: c.manifestation.id,
          agentId: c.agent.id,
          from: "agent",
          kind: "update",
          text: `The host's device went silent for ${Math.round(silent / 60)} minutes, so I ended the session and wrote up what I had.`,
          atSec: null,
          createdAt: now,
        },
      ]);
      await brief(d, c.manifestation.id).catch((e) =>
        console.error("brief after sweep failed", e),
      );
    } catch {
      // Someone else ended it first. Nothing to do.
    }
  }
  return ended;
}
