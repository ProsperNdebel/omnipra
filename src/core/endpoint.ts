import type { EndpointId, ISODate, UserId } from "./ids";

/**
 * A physical thing an agent can manifest through. Today: a phone running the web host page.
 * Glasses, robots and fixed sensors become new `kind` and `Capability` values, not new code paths.
 */
export interface Endpoint {
  id: EndpointId;
  hostId: UserId;
  kind: EndpointKind;
  capabilities: Capability[];
  createdAt: ISODate;
}

export type EndpointKind = "phone_web";
export type Capability = "mic" | "camera" | "location";

export function supports(endpoint: Pick<Endpoint, "capabilities">, required: Capability[]): boolean {
  return required.every((c) => endpoint.capabilities.includes(c));
}
