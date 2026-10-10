import { cleanLead, type Lead } from "@/core";
import type { Deps } from "@/pipeline";

/** Someone asked for early access. Saved (or updated, by email); says whether they're new. */
export async function joinEarlyAccess(
  d: Deps,
  raw: Record<string, unknown>,
): Promise<{ lead: Lead; isNew: boolean }> {
  const lead: Lead = {
    ...cleanLead(raw),
    id: d.newId(),
    createdAt: d.now(),
  };
  const { isNew } = await d.repos.leads.save(lead);
  return { lead, isNew };
}

export async function listLeads(d: Deps): Promise<Lead[]> {
  return d.repos.leads.list();
}
