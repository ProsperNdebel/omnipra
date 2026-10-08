import type { NoteInContext, Observation } from "@/core";
import type { Deps } from "./deps";

/** Attach the event each note was heard at. One query. */
export async function withTitles(
  d: Deps,
  notes: Observation[],
): Promise<NoteInContext[]> {
  const ids = [...new Set(notes.map((n) => n.manifestationId))];
  const contexts = ids.length
    ? await d.repos.manifestations.contexts({ ids })
    : [];
  const title = new Map(
    contexts.map((c) => [c.manifestation.id, c.event.title]),
  );
  return notes.map((note) => ({
    note,
    eventTitle: title.get(note.manifestationId) ?? "an event",
  }));
}
