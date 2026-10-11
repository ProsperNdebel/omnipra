import Link from "next/link";
import { upcomingEvents, type EventSummary } from "@/services";
import { getDeps } from "@/server/deps";
import { Dot } from "@/ui/bar";
import { dayOf, fmtDay, fmtTime, money, plural } from "@/ui/format";

export const dynamic = "force-dynamic";

/** Past this many, show one day at a time (a whole tech week is hundreds). */
const ALL_AT_ONCE = 60;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; q?: string }>;
}) {
  const [all, { day, q }] = await Promise.all([
    upcomingEvents(getDeps()),
    searchParams,
  ]);
  const now = new Date().toISOString();
  const query = (q ?? "").trim().toLowerCase();
  const allDays = groupByDay(all);
  const keys = allDays.map(([k]) => k);
  const paged = all.length > ALL_AT_ONCE && !query;
  // One day at a time: the one asked for, else today, else the first with events.
  const today = dayOf(now);
  const current = paged
    ? keys.includes(day ?? "")
      ? day!
      : keys.includes(today)
        ? today
        : keys[0]
    : null;
  const events = query
    ? all.filter(({ event }) =>
        `${event.title} ${event.venue ?? ""}`.toLowerCase().includes(query),
      )
    : all;
  const days = paged
    ? allDays.filter(([k]) => k === current)
    : groupByDay(events);

  return (
    <main className="page">
      <h1 className="display">
        Be where
        <br />
        you can&rsquo;t.
      </h1>
      <p className="lede">
        Never miss the room again. Your agent attends the events that you
        can&rsquo;t make, from conference halls to expos, through people already
        there.
      </p>

      {all.length > ALL_AT_ONCE && (
        <nav className="day-nav" aria-label="Days">
          <form action="/" className="day-search">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder={`Search ${all.length} events`}
              aria-label="Search events"
            />
          </form>
          <div className="day-links">
            {allDays.map(([k, list]) => (
              <Link
                key={k}
                href={`/?day=${k}`}
                aria-current={!query && k === current ? "page" : undefined}
              >
                {fmtDay(list[0]!.event.startsAt).split(",")[0]!.slice(0, 3)}{" "}
                {Number(k.slice(8))}
                <span className="muted"> {list.length}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      {query && days.length === 0 ? (
        <p style={{ marginTop: 40 }}>
          Nothing matches &ldquo;{q}&rdquo;. <Link href="/">Clear the search</Link>.
        </p>
      ) : days.length === 0 ? (
        <p style={{ marginTop: 72 }}>
          No events this week yet. <Link href="/events/new">Add one</Link>.
        </p>
      ) : (
        days.map(([key, list]) => (
          <section key={key} aria-label={fmtDay(list[0]!.event.startsAt)}>
            <h2 className="day">{fmtDay(list[0]!.event.startsAt)}</h2>
            <ol className="schedule">
              {list.map(({ event, hosts, fromCents }) => (
                <li
                  className="slot"
                  key={event.id}
                  style={event.endsAt < now ? { opacity: 0.5 } : undefined}
                >
                  <time className="time" dateTime={event.startsAt}>
                    {fmtTime(event.startsAt)}
                  </time>
                  <div className="what">
                    <Link href={`/events/${event.id}`}>{event.title}</Link>
                  </div>
                  <div className="meta">
                    {event.endsAt < now ? (
                      "Ended"
                    ) : event.startsAt <= now ? (
                      <>
                        <Dot on breathe />
                        Happening now
                        {hosts > 0 && `, ${plural(hosts, "host")}`}
                      </>
                    ) : event.capturePolicy === "none" ? (
                      "No recording allowed"
                    ) : hosts === 0 ? (
                      "No hosts yet"
                    ) : (
                      `${plural(hosts, "host")}, from ${money(fromCents!)}`
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}

      <p className="small muted" style={{ marginTop: 40 }}>
        Missing an event? <Link href="/events/new">Add it</Link>.
      </p>
    </main>
  );
}

function groupByDay(events: EventSummary[]): [string, EventSummary[]][] {
  const map = new Map<string, EventSummary[]>();
  for (const e of events) {
    const k = dayOf(e.event.startsAt);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.entries()];
}
