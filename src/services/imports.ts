import { DomainError, type PresenceEvent } from "@/core";
import type { Deps } from "@/pipeline";

/**
 * Bring in many events at once (a whole tech week). Events keep the id they came with,
 * so importing the same calendar again updates them instead of adding copies. Nobody
 * becomes their host by importing; hosts list themselves as usual.
 */
export async function importEvents(
  d: Deps,
  events: PresenceEvent[],
): Promise<{ added: number; updated: number }> {
  const clean = events.filter(
    (e) => e.title.trim() && Date.parse(e.endsAt) > Date.parse(e.startsAt),
  );
  if (clean.length === 0)
    throw new DomainError("bad_request", "Nothing to import.");
  const times = clean.map((e) => e.startsAt).sort();
  const existing = new Set(
    (
      await d.repos.events.list({
        from: times[0]!,
        to: new Date(Date.parse(times.at(-1)!) + 86_400_000).toISOString(),
      })
    ).map((e) => e.id),
  );
  await d.repos.events.saveMany(clean);
  const updated = clean.filter((e) => existing.has(e.id)).length;
  return { added: clean.length - updated, updated };
}
