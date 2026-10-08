import type { EndpointId, ISODate, UserId } from "./ids";

/**
 * A body an agent can manifest through. A phone running the host page was the first;
 * glasses, earbuds, a room microphone, a robot or a car are the same thing with
 * different capabilities. Nothing downstream branches on `kind`: it only asks what
 * a body can do.
 */
export interface Endpoint {
  id: EndpointId;
  hostId: UserId;
  kind: EndpointKind;
  /** What the host calls it: "My phone", "Table mic", "Ray-Bans". */
  name: string;
  capabilities: Capability[];
  /**
   * SHA-256 of the device's own token, for bodies that call the device API directly.
   * Null for the browser phone, which acts through the host's session.
   */
  tokenHash: string | null;
  lastSeenAt: ISODate | null;
  createdAt: ISODate;
}

export const ENDPOINT_KINDS = [
  "phone_web",
  "glasses",
  "earbuds",
  "room",
  "robot",
  "vehicle",
  "other",
] as const;
export type EndpointKind = (typeof ENDPOINT_KINDS)[number];

/**
 * mic: it can hear. camera: it can see (photos or frames). speaker: it can talk
 * in the room. location: it knows where it is. display: it can show the host something.
 */
export const CAPABILITIES = [
  "mic",
  "camera",
  "speaker",
  "location",
  "display",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export function supports(
  endpoint: Pick<Endpoint, "capabilities">,
  required: Capability[],
): boolean {
  return required.every((c) => endpoint.capabilities.includes(c));
}

export const DEVICE_TOKEN_PREFIX = "dev_";
