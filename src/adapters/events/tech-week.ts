import type { EventId, PresenceEvent } from "@/core";

/**
 * Reads a Tech Week city calendar (tech-week.com/calendar/<city>) into events.
 *
 * The calendar page carries its events as data in the page itself, 48 at a time. To
 * get all of them we ask for narrower slices (a day, then a time of day, then a
 * neighborhood) until every slice comes back under that cap.
 */

/** What the calendar says about one event. Only the fields we use. */
interface TechWeekEvent {
  id: string;
  name: string;
  date: string; // 2026-10-13
  time: string; // 18:30
  endDate?: string | null;
  endTime?: string | null;
  location?: string | null;
  company?: string | null;
  registrationStatus?: string;
}

const PAGE_SIZE = 48;
const TIMES = ["morning", "noon", "afternoon", "evening"];
/** Without an end time, assume a couple of hours. */
const DEFAULT_HOURS = 2;

export interface TechWeekImport {
  city: string;
  events: PresenceEvent[];
  /** How many the calendar itself says it lists, to compare. */
  expected: number | null;
  /** Requests made, for the log. */
  requests: number;
}

/**
 * `calendarUrl`: e.g. https://www.tech-week.com/calendar/la.
 * `timeZone`: where the calendar's times are, e.g. America/Los_Angeles.
 */
export async function readTechWeek(
  calendarUrl: string,
  timeZone: string,
  fetchFn: typeof fetch = fetch,
): Promise<TechWeekImport> {
  const url = new URL(calendarUrl);
  if (!/(^|\.)tech-week\.com$/.test(url.hostname) || !/^\/calendar\/[\w-]+\/?$/.test(url.pathname))
    throw new Error("Use a Tech Week calendar link, like https://www.tech-week.com/calendar/la");
  const city = url.pathname.split("/")[2]!;
  let requests = 0;

  const page = async (params: Record<string, string>) => {
    const u = new URL(url.pathname, url.origin);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    // Tech Week rate limits; when it says slow down, wait as asked (or back off) and retry.
    for (let attempt = 0; ; attempt++) {
      requests++;
      const res = await fetchFn(u, { headers: { RSC: "1" }, cache: "no-store" });
      if (res.ok) return res.text();
      if (res.status !== 429 || attempt >= 3)
        throw new Error(
          res.status === 429
            ? "Tech Week is rate limiting this server. Use the file upload below instead."
            : `Tech Week answered ${res.status} for ${u}`,
        );
      const wait = Number(res.headers.get("retry-after")) || 5 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
    }
  };

  const first = await page({});
  const days = dayKeys(first);
  const locations = facetKeys(first, "locations");
  if (days.length === 0) throw new Error("Couldn't find the calendar's days on that page.");

  const found = new Map<string, TechWeekEvent>();
  const take = (txt: string) => {
    const list = eventsIn(txt, city);
    for (const e of list) found.set(e.id, e);
    return list.length;
  };

  for (const day of days) {
    if (take(await page({ day })) < PAGE_SIZE) continue;
    for (const time of TIMES) {
      if (take(await page({ day, time })) < PAGE_SIZE) continue;
      // The narrowest slices, one at a time so as not to trip the rate limit.
      for (const location of locations) take(await page({ day, time, location }));
    }
  }

  const events = [...found.values()].map((e) => toEvent(e, url.origin, city, timeZone));
  return { city, events, expected: totalIn(first), requests };
}

function toEvent(e: TechWeekEvent, origin: string, city: string, timeZone: string): PresenceEvent {
  const startsAt = zonedToIso(e.date, e.time || "00:00", timeZone);
  const endsAt =
    e.endTime && e.endDate
      ? zonedToIso(e.endDate, e.endTime, timeZone)
      : new Date(Date.parse(startsAt) + DEFAULT_HOURS * 3600_000).toISOString();
  return {
    // Tech Week's own id, so importing again updates instead of duplicating.
    id: e.id as EventId,
    title: e.name.trim(),
    startsAt,
    endsAt: Date.parse(endsAt) > Date.parse(startsAt) ? endsAt : new Date(Date.parse(startsAt) + DEFAULT_HOURS * 3600_000).toISOString(),
    venue: e.location === "Virtual" ? "Online" : e.location || null,
    sourceUrl: `${origin}/calendar/${city}/events/${slug(e.name)}-${e.id}`,
    // On stage talks may be heard; hosts still confirm recording is fine before starting.
    capturePolicy: "public_talk",
  };
}

/** Every `{"id":"<uuid>","city":...}` object in the page data, parsed. */
export function eventsIn(txt: string, _city: string): TechWeekEvent[] {
  const out: TechWeekEvent[] = [];
  const re = /\{"id":"[0-9a-f-]{36}","city":"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    const end = objectEnd(txt, m.index);
    if (end < 0) break;
    try {
      const o = JSON.parse(txt.slice(m.index, end + 1)) as TechWeekEvent;
      if (o.name && o.date) out.push(o);
    } catch {
      // Not an event after all; skip it.
    }
    re.lastIndex = end;
  }
  return out;
}

/** Index of the brace closing the object that opens at `start`, or -1. */
function objectEnd(txt: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < txt.length; j++) {
    const c = txt[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return j;
  }
  return -1;
}

/** The calendar's days: its own "days" list, or failing that the dates its events carry. */
function dayKeys(txt: string): string[] {
  const listed = txt.match(/"days":(\["\d{4}-\d{2}-\d{2}"(?:,"\d{4}-\d{2}-\d{2}")*\])/);
  if (listed) return JSON.parse(listed[1]!) as string[];
  const dates = new Set<string>();
  for (const m of txt.matchAll(/"date":"(\d{4}-\d{2}-\d{2})"/g)) dates.add(m[1]!);
  if (dates.size === 0) return [];
  // Fill gaps between the first and last day so quiet days aren't skipped.
  const sorted = [...dates].sort();
  const out: string[] = [];
  for (let t = Date.parse(sorted[0]!); t <= Date.parse(sorted.at(-1)!); t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** How many events the calendar says match, if it says. */
export function totalIn(txt: string): number | null {
  const m = txt.match(/"perPage":\d+,"total":(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Filter keys for one facet, e.g. locations: santa-monica, venice, ... */
function facetKeys(txt: string, facet: string): string[] {
  const at = txt.indexOf(`"${facet}":[{"key":`);
  if (at < 0) return [];
  const start = txt.indexOf("[", at);
  const end = txt.indexOf("]", start);
  try {
    return (JSON.parse(txt.slice(start, end + 1)) as { key: string }[]).map((x) => x.key);
  } catch {
    return [];
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 80) || "event";

/** "2026-10-13" + "18:30" in a time zone, as a UTC ISO string. */
export function zonedToIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Correct by the zone's offset at that moment; twice, in case it lands across a change.
  let t = asUtc - offsetMs(asUtc, timeZone);
  t = asUtc - offsetMs(t, timeZone);
  return new Date(t).toISOString();
}

function offsetMs(t: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return local - Math.floor(t / 1000) * 1000;
}
