import { notFound } from "next/navigation";
import { isAdmin } from "@/server/viewer";
import { SubmitButton } from "@/ui/submit-button";
import { importTechWeekAction } from "./actions";

export const dynamic = "force-dynamic";
// Reading a whole calendar takes a couple hundred page requests.
export const maxDuration = 300;

/** For the team: bring a Tech Week city's events in at once. */
export default async function ImportEvents({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!(await isAdmin())) notFound();
  const { added, updated, expected, city, error } = await searchParams;

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Import events</h1>
        <p className="muted">
          Pulls every event from a Tech Week calendar. Importing again updates
          them, never duplicates. Nobody is listed as a host; people still list
          themselves.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {added !== undefined && (
          <p>
            Imported {city?.toUpperCase()}: {added} new, {updated} updated
            {expected ? ` (the calendar lists ${expected})` : ""}.
          </p>
        )}
        <form action={importTechWeekAction} className="stack">
          <label className="field">
            <span>Tech Week calendar</span>
            <input
              type="url"
              name="url"
              required
              defaultValue="https://www.tech-week.com/calendar/la"
            />
          </label>
          <label className="field">
            <span>Its time zone</span>
            <select name="tz" defaultValue="America/Los_Angeles">
              <option value="America/Los_Angeles">Pacific (LA, SF)</option>
              <option value="America/New_York">Eastern (NYC, Boston)</option>
              <option value="America/Chicago">Central</option>
              <option value="Europe/London">London</option>
            </select>
          </label>
          <SubmitButton pending="Importing, about a minute">Import</SubmitButton>
        </form>
      </div>
    </main>
  );
}
