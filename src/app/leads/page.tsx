import { notFound } from "next/navigation";
import { leadIntentLabel } from "@/core";
import { listLeads } from "@/services";
import { getDeps } from "@/server/deps";
import { isAdmin } from "@/server/viewer";
import { fmtDay } from "@/ui/format";

export const dynamic = "force-dynamic";

/** The early access list, for the team. */
export default async function Leads() {
  if (!(await isAdmin())) notFound();
  const leads = await listLeads(getDeps());

  return (
    <main className="page">
      <h1 className="title">Early access</h1>
      <p className="muted" style={{ marginTop: 16 }}>
        {leads.length} {leads.length === 1 ? "person" : "people"}.{" "}
        <a href="/api/leads">Download CSV</a>
      </p>
      {leads.length > 0 && (
        <ol className="rows" style={{ marginTop: 40 }}>
          {leads.map((l) => (
            <li key={l.id}>
              <div className="full">
                <strong>
                  {l.firstName} {l.lastName}
                </strong>{" "}
                <a href={`mailto:${l.email}`}>{l.email}</a>
              </div>
              <div className="full small muted">
                {leadIntentLabel(l.intent)}
                {l.note && `: ${l.note}`}
                {l.source && ` · from ${l.source}`} · {fmtDay(l.createdAt)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
