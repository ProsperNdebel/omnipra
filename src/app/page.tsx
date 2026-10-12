import Link from "next/link";
import { upcomingEvents, type EventSummary } from "@/services";
import { getDeps } from "@/server/deps";
import { Dot } from "@/ui/bar";
import { dayOf, fmtDay, fmtTime, money, plural } from "@/ui/format";

export const dynamic = "force-dynamic";

/** Past this many, open a category on one day at a time instead of rendering hundreds. */
const ALL_AT_ONCE = 60;

interface EventGroup {
  key: string;
  label: string;
  events: EventSummary[];
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; day?: string; q?: string }>;
}) {
  const [all, { group, day, q }] = await Promise.all([
    upcomingEvents(getDeps()),
    searchParams,
  ]);
  const groups = groupEvents(all);
  const selected = groups.find((g) => g.key === group) ?? null;

  if (!selected) return <GroupIndex groups={groups} total={all.length} />;

  const now = new Date().toISOString();
  const query = (q ?? "").trim().toLowerCase();
  const events = query
    ? selected.events.filter(({ event }) =>
        `${event.title} ${event.venue ?? ""}`.toLowerCase().includes(query),
      )
    : selected.events;

  const allDays = groupByDay(selected.events);
  const resultDays = groupByDay(events);
  const keys = allDays.map(([k]) => k);
  const paged = selected.events.length > ALL_AT_ONCE && !query;
  const today = dayOf(now);
  // A large category opens on today (or its first day). "All" is still one click away.
  const current =
    paged && day !== "all"
      ? keys.includes(day ?? "")
        ? day!
        : keys.includes(today)
          ? today
          : (keys[0] ?? null)
      : null;
  const days = current
    ? resultDays.filter(([k]) => k === current)
    : resultDays;

  return (
    <main className="page">
      <p className="small muted" style={{ marginTop: 64 }}>
        <Link href="/">All event groups</Link>
      </p>
      <h1 className="title" style={{ marginTop: 16 }}>
        {selected.label}
      </h1>
      <p className="muted">
        {query
          ? plural(events.length, "matching event")
          : plural(selected.events.length, "event")}
      </p>

      <nav className="day-nav" aria-label="Event days">
        <form action="/" className="day-search">
          <input type="hidden" name="group" value={selected.key} />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search events"
            aria-label={`Search ${selected.label}`}
          />
        </form>

        <div className="day-links">
          <DayLink
            href={groupHref(selected.key, "all")}
            active={current === null && !query}
            label="All"
            count={selected.events.length}
          />
          {allDays.map(([k, list]) => (
            <DayLink
              key={k}
              href={groupHref(selected.key, k)}
              active={!query && k === current}
              label={fmtDayTab(list[0]!.event.startsAt)}
              count={list.length}
            />
          ))}
        </div>
      </nav>

      {query && days.length === 0 ? (
        <p style={{ marginTop: 40 }}>
          Nothing matches &ldquo;{q}&rdquo;.{" "}
          <Link href={groupHref(selected.key, "all")}>Clear the search</Link>.
        </p>
      ) : days.length === 0 ? (
        <p style={{ marginTop: 72 }}>No events here yet.</p>
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

function GroupIndex({
  groups,
  total,
}: {
  groups: EventGroup[];
  total: number;
}) {
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

      <h2 className="section">What&rsquo;s on</h2>
      <p className="muted">{plural(total, "event")}</p>

      {groups.length === 0 ? (
        <p style={{ marginTop: 40 }}>
          No events this week yet. <Link href="/events/new">Add one</Link>.
        </p>
      ) : (
        <ol className="rows">
          {groups.map((g) => (
            <li className="proposal" key={g.key}>
              <div>
                <Link
                  href={`/?group=${encodeURIComponent(g.key)}`}
                  style={{
                    fontSize: "var(--t-md)",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {g.label}
                </Link>
                <p className="small muted">{groupRange(g.events)}</p>
              </div>
              <span className="muted">{g.events.length}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="small muted" style={{ marginTop: 40 }}>
        Missing an event? <Link href="/events/new">Add it</Link>.
      </p>
    </main>
  );
}

function DayLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        border: `1px solid ${active ? "var(--ink)" : "var(--rule)"}`,
        padding: "10px 14px",
        fontWeight: active ? 600 : 400,
        textDecoration: "none",
      }}
    >
      {label} <span className="muted">{count}</span>
    </Link>
  );
}

/** Event grouping is explicit and independent of how the event entered Omnipra. */
function groupEvents(events: EventSummary[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const summary of events) {
    const category = categoryOf(summary);
    const found = map.get(category.key);
    if (found) found.events.push(summary);
    else map.set(category.key, { ...category, events: [summary] });
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "miscellaneous") return 1;
    if (b.key === "miscellaneous") return -1;
    return a.label.localeCompare(b.label);
  });
}

function categoryOf({ event }: EventSummary): Pick<EventGroup, "key" | "label"> {
  const label = event.collection?.trim();
  return label
    ? { key: `collection:${label.toLowerCase()}`, label }
    : { key: "miscellaneous", label: "Miscellaneous" };
}

function groupHref(group: string, day: string): string {
  const q = new URLSearchParams({ group, day });
  return `/?${q}`;
}

function fmtDayTab(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function groupRange(events: EventSummary[]): string {
  const first = events[0];
  const last = events.at(-1);
  if (!first || !last) return "";
  const start = fmtDayTab(first.event.startsAt);
  const end = fmtDayTab(last.event.startsAt);
  return start === end ? start : `${start} — ${end}`;
}

function groupByDay(events: EventSummary[]): [string, EventSummary[]][] {
  const map = new Map<string, EventSummary[]>();
  for (const e of events) {
    const k = dayOf(e.event.startsAt);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.entries()];
}
