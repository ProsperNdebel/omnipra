import {
  DomainError,
  leadChatLabel,
  leadIntentLabel,
  leadTwinLabel,
  type Lead,
} from "@/core";
import { joinEarlyAccess, listLeads } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";
import { notifyTeam } from "@/server/notify-team";
import { isAdmin } from "@/server/viewer";

export const runtime = "nodejs";

/** POST: the early access form on the landing page. Public. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) throw new DomainError("bad_request", "Something went wrong. Try again.");
    // A field people never see: only bots fill it. Pretend it worked.
    if (typeof body.website === "string" && body.website) {
      return Response.json({ ok: true });
    }
    const { lead, isNew } = await joinEarlyAccess(getDeps(), body);
    if (isNew) {
      notifyTeam(
        `New early access: ${lead.firstName} ${lead.lastName} <${lead.email}>${lead.phone ? ` ${lead.phone}` : ""}, ${leadIntentLabel(lead.intent)}, wants an Entwin: ${leadTwinLabel(lead.twin)}, up for a chat: ${leadChatLabel(lead.chat)}${lead.note ? `: "${lead.note}"` : ""}${lead.source ? ` (from ${lead.source})` : ""}`,
      );
    }
    return Response.json({ ok: true, firstName: lead.firstName });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET: every lead as a CSV, for the team. */
export async function GET() {
  if (!(await isAdmin())) return new Response("Not found", { status: 404 });
  const leads = await listLeads(getDeps());
  return new Response(toCsv(leads), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="omnipra-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function toCsv(leads: Lead[]): string {
  const cell = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;
  const head = ["First name", "Last name", "Email", "Phone", "Wants to", "Wants an Entwin", "Up for a chat", "Note", "Source", "Signed up"];
  const rows = leads.map((l) =>
    [l.firstName, l.lastName, l.email, l.phone, leadIntentLabel(l.intent), leadTwinLabel(l.twin), leadChatLabel(l.chat), l.note, l.source, l.createdAt]
      .map(cell)
      .join(","),
  );
  return [head.map(cell).join(","), ...rows].join("\n") + "\n";
}
