// Branded ids so an AgentId can never be passed where a MissionId is expected.
export type Id<Tag extends string> = string & { readonly __tag: Tag };

export type UserId = Id<"User">;
export type AgentId = Id<"Agent">;
export type EventId = Id<"Event">;
export type MissionId = Id<"Mission">;
export type EndpointId = Id<"Endpoint">;
export type ManifestationId = Id<"Manifestation">;
export type SegmentId = Id<"Segment">;
export type ObservationId = Id<"Observation">;
export type MessageId = Id<"Message">;
export type HostRequestId = Id<"HostRequest">;
export type AskTurnId = Id<"AskTurn">;
export type MemoryId = Id<"Memory">;
export type SuggestionId = Id<"Suggestion">;
export type ActionId = Id<"Action">;

export type ISODate = string;

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
