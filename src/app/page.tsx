import Link from "next/link";
import { upcomingEvents, type EventSummary } from "@/services";
import { getDeps } from "@/server/deps";
import { Dot } from "@/ui/bar";
import { dayOf, fmtDay, fmtTime, money, plural } from "@/ui/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await upcomingEvents(getDeps());
  const days = groupByDay(events);
  const now = new Date().toISOString();

  return (
    <main className="page">
      <h1 className="display">
        Be where
        <br />
        you can&rsquo;t.
      </h1>
      <p className="lede">
        Send your agent to the events you can&rsquo;t make, through people
        already there.
      </p>

      {/* No agent yet: we build one. Plain text on purpose, under the main pitch. */}
      <div className="entwin narrow">
        <p>
          And yes, we know what you&rsquo;re thinking. No agent yet? We&rsquo;ll
          build you one: your Entwin, an &ldquo;Entangled Twin&rdquo; that
          doesn&rsquo;t just work for you, it acts as you. Across your email,
          calendar, messages and the AI tools you already use, and above all in
          person, where your relationships are actually built.
        </p>
        <p>
          Privacy and security sit at its core. It&rsquo;s made for small
          business founders wearing every hat at once, and for enterprises just
          starting to tinker with AI.
        </p>
      </div>

      {days.length === 0 ? (
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
