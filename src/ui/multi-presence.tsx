import Link from "next/link";
import type { RoomValue } from "@/core";
import type { AttentionView } from "@/services";
import { Sources } from "./actions-panel";
import { Dot } from "./bar";
import { plural } from "./format";

const VALUE_WORDS: Record<RoomValue, string> = {
  high: "Matters most right now",
  medium: "Worth keeping an ear on",
  low: "Low value for your goals right now",
};

/**
 * One agent across several rooms: not a stack of streams, but how it is dividing
 * its attention, where it is focusing, and what the rooms have in common.
 */
export function MultiPresence({
  name,
  rooms,
  attention,
}: {
  name: string;
  rooms: {
    id: string;
    eventTitle: string;
    hostName: string | null;
    observations: number;
  }[];
  attention: AttentionView | null;
}) {
  const stateOf = new Map<string, AttentionView["rooms"][number]>(
    (attention?.rooms ?? []).map((r) => [r.manifestationId, r]),
  );
  const rank: Record<RoomValue, number> = { high: 0, medium: 1, low: 2 };
  const ordered = [...rooms].sort(
    (a, b) =>
      rank[stateOf.get(a.id)?.value ?? "medium"] -
      rank[stateOf.get(b.id)?.value ?? "medium"],
  );

  return (
    <section className="narrow" id="rooms">
      <h2 className="section">Present in {plural(rooms.length, "place")}</h2>
      {attention?.pattern && (
        <div className="talk" style={{ marginTop: 12 }}>
          <div
            className="talk-nudge"
            style={{ borderLeft: "3px solid var(--ink)", paddingLeft: 14 }}
          >
            <div className="small muted">{name}, across rooms</div>
            <div style={{ fontWeight: 500 }}>{attention.pattern.text}</div>
            <Sources sources={attention.patternSources} />
          </div>
        </div>
      )}
      <ul className="rows">
        {ordered.map((r) => {
          const s = stateOf.get(r.id);
          const focus = attention?.focus?.manifestationId === r.id;
          return (
            <li key={r.id}>
              <div className="full">
                <div className="small muted">
                  <Dot on breathe={focus} />
                  {focus
                    ? "Prioritizing"
                    : s
                      ? VALUE_WORDS[s.value]
                      : "Listening"}
                  {r.hostName && `, through ${r.hostName}`}
                  {`, ${plural(r.observations, "note")}`}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Link href={`/m/${r.id}`}>{r.eventTitle}</Link>
                </div>
                {s?.status && (
                  <div className="small" style={{ marginTop: 2 }}>
                    {s.status}
                  </div>
                )}
                {focus && attention?.focus?.why && (
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {attention.focus.why}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
