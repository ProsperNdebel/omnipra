import {
  type Capability,
  DomainError,
  supports,
  type EventId,
  type Manifestation,
  type ManifestationId,
  type Mission,
  type MissionId,
  type UserId,
  type Autonomy,
} from "@/core";
import { recordSession, type Deps } from "@/pipeline";
import { ownedAgent } from "./agents";

/**
 * "Send my agent." Creates the mission and a manifestation request to one host.
 * Capture is only offered where the event allows it.
 */
export async function sendAgent(
  d: Deps,
  input: {
    ownerId: UserId;
    agentId: string;
    eventId: EventId;
    hostId: UserId;
    instructions: string;
    alerts: string[];
    /** Only "act" if the host takes requests; otherwise the agent can't reach them anyway. */
    autonomy: Autonomy;
    /** What the body must be able to do. Hearing, unless asked for more. */
    requires?: Capability[];
  },
): Promise<Manifestation> {
  if (!input.agentId)
    throw new DomainError("bad_request", "Pick which agent to send.");
  const agent = await ownedAgent(d, input.ownerId, input.agentId);

  const event = await d.repos.events.get(input.eventId);
  if (!event) throw new DomainError("not_found", "event not found");
  if (event.endsAt < d.now())
    throw new DomainError("bad_request", "This event has already ended.");
  if (event.capturePolicy === "none") {
    throw new DomainError(
      "bad_request",
      "This event doesn't allow recording, so agents can't attend it.",
    );
  }

  const listing = (await d.repos.events.listings(event.id)).find(
    (l) => l.hostId === input.hostId,
  );
  if (!listing)
    throw new DomainError(
      "not_found",
      "That host isn't listed for this event anymore.",
    );

  // A host who blocked this owner simply isn't available to them.
  if (await d.repos.blocks.isBlocked(input.hostId, input.ownerId))
    throw new DomainError("bad_request", "That host isn't available.");

  const endpoint = await d.repos.endpoints.get(listing.endpointId);
  const requires: Capability[] = input.requires?.length
    ? input.requires
    : ["mic"];
  if (!endpoint || !supports(endpoint, requires)) {
    throw new DomainError(
      "bad_request",
      `That host's device can't do what this needs (${requires.join(", ")}).`,
    );
  }

  const mission: Mission = {
    id: d.newId() as MissionId,
    agentId: agent.id,
    eventId: event.id,
    instructions: input.instructions.trim(),
    alerts: input.alerts.map((a) => a.trim()).filter(Boolean),
    context: ["memory"],
    requires,
    autonomy: listing.openToRequests ? input.autonomy : "ask_first",
    orders: [],
    plan: null,
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
    captureConfirmedAt: null,
    startedAt: null,
    endedAt: null,
    lastHeardAt: null,
    createdAt: d.now(),
  };
  await d.repos.manifestations.save(manifestation, null);
  await recordSession(
    d,
    { manifestation, agent, endpoint },
    input.ownerId,
    "session.requested",
    event.title,
  );
  return manifestation;
}
