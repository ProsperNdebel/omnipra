/**
 * All dates render in the events' city, on server and client alike, so
 * hydration matches and a host in another timezone still sees local event times.
 */
export const EVENT_TZ = "America/Los_Angeles";

const time = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TZ, weekday: "long", month: "long", day: "numeric" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const fmtTime = (iso: string) => time.format(new Date(iso));
export const fmtDay = (iso: string) => day.format(new Date(iso));
export const dayOf = (iso: string) => dayKey.format(new Date(iso));

export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)} to ${fmtTime(endIso)}`;
}

export function money(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function clock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * datetime-local inputs give "2026-10-08T18:00" with no zone. Interpret it in EVENT_TZ.
 * Works by measuring the zone's offset at that instant, which handles DST.
 */
export function localInputToIso(value: string): string {
  const asUtc = new Date(`${value}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: EVENT_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(asUtc)
      .map((p) => [p.type, p.value]),
  );
  const zoned = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return new Date(asUtc.getTime() - (zoned - asUtc.getTime())).toISOString();
}
