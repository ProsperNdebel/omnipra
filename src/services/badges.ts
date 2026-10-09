import type { UserId } from "@/core";
import type { Deps } from "@/pipeline";

/** How many things are waiting on this person, per side of the app. */
export interface Badges {
  /** As an owner: asks to approve, memories, actions, suggestions, plans, introductions. */
  agents: number;
  /** As a host: requests to accept, and asks from agents in live sessions. */
  hosting: number;
}

export async function badges(d: Deps, viewer: UserId): Promise<Badges> {
  const [agents, hosting] = await Promise.all([
    ownerCount(d, viewer),
    hostCount(d, viewer),
  ]);
  return { agents, hosting };
}

async function ownerCount(d: Deps, ownerId: UserId): Promise<number> {
  const agents = await d.repos.agents.byOwner(ownerId);
  if (agents.length === 0) return 0;
  const ids = agents.map((a) => a.id);
  const live = await d.repos.manifestations.contexts({
    agentIds: ids,
    status: "live",
  });
  const [asks, ...perAgent] = await Promise.all([
    d.repos.hostRequests
      .byManifestations(live.map((c) => c.manifestation.id))
      .then((rs) => rs.filter((r) => r.status === "proposed").length),
    ...agents.map(async (a) => {
      const [memories, actions, suggestions, outings, encounters] =
        await Promise.all([
          d.repos.memories.byAgent(a.id),
          d.repos.actions.byAgent(a.id),
          d.repos.suggestions.byAgent(a.id),
          d.repos.outings.byAgent(a.id),
          d.repos.encounters.byAgent(a.id),
        ]);
      return (
        memories.filter((m) => m.status === "proposed").length +
        actions.filter((x) => x.status === "proposed").length +
        suggestions.filter((s) => s.status === "open").length +
        outings.filter((o) => o.status === "proposed").length +
        encounters.filter(
          (e) =>
            e.status === "open" &&
            e.sides.some(
              (s) => s.agentId === a.id && s.relevant && s.answer === "pending",
            ),
        ).length
      );
    }),
  ]);
  return asks + perAgent.reduce((x, y) => x + y, 0);
}

async function hostCount(d: Deps, hostId: UserId): Promise<number> {
  const endpoints = await d.repos.endpoints.byHost(hostId);
  if (endpoints.length === 0) return 0;
  const sessions = await d.repos.manifestations.contexts({
    endpointIds: endpoints.map((e) => e.id),
  });
  const requested = sessions.filter(
    (c) => c.manifestation.status === "requested",
  ).length;
  const live = sessions.filter((c) => c.manifestation.status === "live");
  const asks = (
    await d.repos.hostRequests.byManifestations(
      live.map((c) => c.manifestation.id),
    )
  ).filter((r) => r.status === "sent" || r.status === "accepted").length;
  return requested + asks;
}
