import { notFound } from "next/navigation";
import { metrics } from "@/services";
import { getDeps } from "@/server/deps";
import { isAdmin } from "@/server/viewer";
import { money } from "@/ui/format";

export const dynamic = "force-dynamic";

const pct = (x: number | null) =>
  x === null ? "None yet" : `${Math.round(x * 100)}%`;
const num = (x: number | null, unit = "") =>
  x === null ? "None yet" : `${x < 10 ? x.toFixed(1) : Math.round(x)}${unit}`;

/** Is the marketplace working? For the team, not for users. */
export default async function Metrics({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!(await isAdmin())) notFound();
  const days = Math.min(
    365,
    Math.max(1, Number((await searchParams).days) || 30),
  );
  const m = await metrics(getDeps(), days);

  const rows: [string, [string, string][]][] = [
    [
      "Booking",
      [
        ["Requests", String(m.bookings.requested)],
        ["Accepted by hosts", pct(m.bookings.acceptance)],
        ["Time to a host", num(m.bookings.timeToHostMin, " min")],
        ["Cancelled by owners", String(m.bookings.cancelled)],
      ],
    ],
    [
      "Sessions",
      [
        ["Accepted that went live", pct(m.completion.started)],
        ["Live that got a briefing", pct(m.completion.briefed)],
        ["Typical length", num(m.completion.medianLiveMin, " min")],
        ["Emergency stops", String(m.completion.emergencyStops)],
        ["Ended for silence", String(m.completion.abandoned)],
      ],
    ],
    [
      "The agent",
      [
        ["Nudges per session", num(m.nudges.perLiveSession)],
        ["Nudges the owner answered", pct(m.nudges.answered)],
        ["Asks hosts completed", pct(m.hostRequests.completion)],
        [
          "Time for a host to answer",
          num(m.hostRequests.medianAnswerMin, " min"),
        ],
      ],
    ],
    [
      "Money",
      [
        ["Booked with hosts", money(m.money.bookedCents)],
        [
          "Average session",
          m.money.averageCents === null ? "None yet" : money(m.money.averageCents),
        ],
      ],
    ],
    [
      "Coming back",
      [
        ["Owners", String(m.repeat.owners)],
        [
          "Sent their agent again",
          `${m.repeat.returning} (${pct(m.repeat.rate)})`,
        ],
      ],
    ],
    [
      "Background work",
      [
        ["Waiting", String(m.jobs.queued + m.jobs.running)],
        ["Failed for good", String(m.jobs.failed)],
      ],
    ],
  ];

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Metrics</h1>
        <p className="muted">
          Last {days} days. Owners sending their agent again is the number that
          matters most.
        </p>
        {rows.map(([title, list]) => (
          <section key={title}>
            <h2 className="section">{title}</h2>
            <ul className="rows">
              {list.map(([k, v]) => (
                <li key={k}>
                  <div>{k}</div>
                  <div>{v}</div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
