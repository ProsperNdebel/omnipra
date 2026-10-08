import { createHash, randomBytes } from "node:crypto";
import {
  CAPABILITIES,
  DEVICE_TOKEN_PREFIX,
  DomainError,
  ENDPOINT_KINDS,
  type Capability,
  type Endpoint,
  type EndpointId,
  type EndpointKind,
  type ManifestationEvent,
  type ManifestationId,
  type UserId,
} from "@/core";
import { applyTransition, type Deps } from "@/pipeline";

const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

const TOUCH_EVERY_MS = 60_000;

/**
 * A host adds a body: glasses, a room mic, a robot, anything that can call the device
 * API. Its token is returned once and only its hash is kept.
 */
export async function registerDevice(
  d: Deps,
  hostId: UserId,
  input: { name: string; kind: string; capabilities: string[] },
): Promise<{ device: Endpoint; token: string }> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new DomainError("bad_request", "Name the device.");
  const kind = ENDPOINT_KINDS.find(
    (k) => k === input.kind && k !== "phone_web",
  );
  if (!kind)
    throw new DomainError("bad_request", "Pick what kind of device it is.");
  const capabilities = CAPABILITIES.filter((c) =>
    input.capabilities.includes(c),
  );
  if (!capabilities.includes("mic") && !capabilities.includes("camera"))
    throw new DomainError("bad_request", "A body needs to hear or see.");
  const token = `${DEVICE_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const device: Endpoint = {
    id: d.newId() as EndpointId,
    hostId,
    kind: kind as EndpointKind,
    name,
    capabilities: capabilities as Capability[],
    tokenHash: hash(token),
    lastSeenAt: null,
    createdAt: d.now(),
  };
  await d.repos.endpoints.save(device);
  return { device, token };
}

/** The host's bodies that can carry agents: their phone, and any device still connected. */
export async function hostDevices(
  d: Deps,
  hostId: UserId,
): Promise<Endpoint[]> {
  return (await d.repos.endpoints.byHost(hostId)).filter(
    (e) => e.kind === "phone_web" || e.tokenHash !== null,
  );
}

/** Disconnect a device. Its past sessions stay; its token stops working. */
export async function disconnectDevice(d: Deps, hostId: UserId, id: string) {
  const e = await d.repos.endpoints.get(id as EndpointId);
  if (!e || e.hostId !== hostId || e.kind === "phone_web")
    throw new DomainError("not_found", "That device isn't yours.");
  await d.repos.endpoints.save({ ...e, tokenHash: null });
}

/** Which body is calling, from its bearer token. */
export async function authenticateDevice(
  d: Deps,
  authorization: string | null,
): Promise<Endpoint> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token?.startsWith(DEVICE_TOKEN_PREFIX))
    throw new DomainError(
      "unauthorized",
      "Send the device token as: Authorization: Bearer dev_...",
    );
  const e = await d.repos.endpoints.byTokenHash(hash(token));
  if (!e)
    throw new DomainError("unauthorized", "That device token isn't valid.");
  const now = d.now();
  if (
    !e.lastSeenAt ||
    Date.parse(now) - Date.parse(e.lastSeenAt) > TOUCH_EVERY_MS
  )
    await d.repos.endpoints.save({ ...e, lastSeenAt: now });
  return e;
}

/** What this body is booked for: sessions waiting on it, ready, or running. */
export async function deviceSessions(d: Deps, device: Endpoint) {
  const sessions = await d.repos.manifestations.contexts({
    endpointIds: [device.id],
  });
  return sessions
    .filter((c) =>
      ["requested", "accepted", "live"].includes(c.manifestation.status),
    )
    .map((c) => ({
      id: c.manifestation.id,
      status: c.manifestation.status,
      agent: c.agent.name,
      event: {
        title: c.event.title,
        starts_at: c.event.startsAt,
        ends_at: c.event.endsAt,
      },
      needs: c.mission.requires,
    }));
}

/** A session on this body, or nothing: a device can only touch what it carries. */
export async function deviceSession(d: Deps, device: Endpoint, id: string) {
  const m = await d.repos.manifestations.get(id as ManifestationId);
  if (!m || m.endpointId !== device.id)
    throw new DomainError("not_found", "No such session on this device.");
  return m;
}

/** The device acts as its host: accept, decline, start (with consent confirmed), end. */
export async function deviceTransition(
  d: Deps,
  device: Endpoint,
  id: string,
  action: string,
  captureConfirmed: boolean,
) {
  if (!["accept", "decline", "start", "end"].includes(action))
    throw new DomainError(
      "bad_request",
      "Action must be accept, decline, start or end.",
    );
  const m = await deviceSession(d, device, id);
  return applyTransition(d, m.id, action as ManifestationEvent, {
    captureConfirmed,
  });
}
