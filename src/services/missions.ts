import {
  DomainError,
  supports,
  type EventId,
  type Manifestation,
  type ManifestationId,
  type Mission,
  type MissionId,
  type UserId,
} from "@/core";
import type { Deps } from "@/pipeline";
import { ownerAgent } from "./agents";

/**
 * "Send my agent." Creates the mission and a manifestation request to one host.
 * Capture is only offered where the event allows it.
 */
export async function sendAgent(
  d: Deps,
  input: { ownerId: UserId; eventId: EventId; hostId: UserId; instructions: string; alerts: string[] },
): Promise<Manifestation> {
  const agent = await ownerAgent(d, input.ownerId);
  if (!agent) throw new DomainError("bad_request", "Create your agent first.");

  const event = await d.repos.events.get(input.eventId);
  if (!event) throw new DomainError("not_found", "event not found");
  if (event.capturePolicy === "none") {
    throw new DomainError("bad_request", "This event doesn't allow recording, so agents can't attend it.");
  }

  const listing = (await d.repos.events.listings(event.id)).find((l) => l.hostId === input.hostId);
  if (!listing) throw new DomainError("not_found", "That host isn't listed for this event anymore.");

  const endpoint = await d.repos.endpoints.get(listing.endpointId);
  const requires = ["mic"] as const;
  if (!endpoint || !supports(endpoint, [...requires])) {
    throw new DomainError("bad_request", "That host's device can't capture audio.");
  }

  const mission: Mission = {
    id: d.newId() as MissionId,
    agentId: agent.id,
    eventId: event.id,
    instructions: input.instructions.trim(),
    alerts: input.alerts.map((a) => a.trim()).filter(Boolean),
    context: ["memory"],
    requires: [...requires],
    createdAt: d.now(),
  };
  await d.repos.missions.save(mission);

  const manifestation: Manifestation = {
    id: d.newId() as ManifestationId,
    missionId: mission.id,
    endpointId: endpoint.id,
    priceCents: listing.priceCents,
    status: "requested",
    observedThroughSec: 0,
    startedAt: null,
    endedAt: null,
    createdAt: d.now(),
  };
  await d.repos.manifestations.save(manifestation, null);
  return manifestation;
}
