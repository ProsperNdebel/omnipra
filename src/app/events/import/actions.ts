"use server";

import { redirect } from "next/navigation";
import { readTechWeek } from "@/adapters/events/tech-week";
import { importEvents } from "@/services";
import { getDeps } from "@/server/deps";
import { reportError } from "@/server/report-error";
import { isAdmin } from "@/server/viewer";

/** Admin: pull a whole Tech Week city calendar in. Nobody becomes a host by this. */
export async function importTechWeekAction(form: FormData) {
  if (!(await isAdmin())) redirect("/");
  const url = String(form.get("url") ?? "").trim();
  const tz = String(form.get("tz") ?? "America/Los_Angeles").trim();
  let q: string;
  try {
    const read = await readTechWeek(url, tz);
    const { added, updated } = await importEvents(getDeps(), read.events);
    q = new URLSearchParams({
      added: String(added),
      updated: String(updated),
      expected: String(read.expected ?? ""),
      city: read.city,
    }).toString();
  } catch (err) {
    reportError(err, "import tech week");
    q = new URLSearchParams({
      error: err instanceof Error ? err.message : "Import failed.",
    }).toString();
  }
  redirect(`/events/import?${q}`);
}
