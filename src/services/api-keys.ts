import { createHash, randomBytes } from "node:crypto";
import {
  API_KEY_PREFIX,
  LEGACY_API_KEY_PREFIXES,
  DomainError,
  type Agent,
  type ApiKey,
  type ApiKeyId,
  type UserId,
} from "@/core";
import { record, type Deps } from "@/pipeline";
import { ownedAgent } from "./agents";

const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

/** Only update "last used" this often, so every API call isn't also a write. */
const TOUCH_EVERY_MS = 60_000;

/** A new key for one agent. The secret is returned once and never stored. */
export async function createApiKey(
  d: Deps,
  ownerId: UserId,
  agentId: string,
  label: string,
): Promise<{ key: ApiKey; secret: string }> {
  const agent = await ownedAgent(d, ownerId, agentId);
  const secret = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const key: ApiKey = {
    id: d.newId() as ApiKeyId,
    agentId: agent.id,
    ownerId,
    label: label.trim().slice(0, 60) || "Outside agent",
    prefix: secret.slice(0, API_KEY_PREFIX.length + 6),
    hash: hash(secret),
    createdAt: d.now(),
    lastUsedAt: null,
    revokedAt: null,
    webhookUrl: null,
    webhookSecret: null,
  };
  await d.repos.apiKeys.save(key);
  await record(d, {
    actorId: ownerId,
    action: "key.created",
    subject: { kind: "key", id: key.id },
    involved: [ownerId],
    detail: `${key.label} (${key.prefix}...) for ${agent.name}`,
  });
  return { key, secret };
}

export async function agentApiKeys(d: Deps, agent: Agent) {
  return (await d.repos.apiKeys.byAgent(agent.id)).filter((k) => !k.revokedAt);
}

export async function revokeApiKey(d: Deps, ownerId: UserId, keyId: string) {
  const k = await d.repos.apiKeys.get(keyId as ApiKeyId);
  if (!k || k.ownerId !== ownerId)
    throw new DomainError("not_found", "That key doesn't exist.");
  if (k.revokedAt) return;
  await d.repos.apiKeys.save({ ...k, revokedAt: d.now() });
  await record(d, {
    actorId: ownerId,
    action: "key.revoked",
    subject: { kind: "key", id: k.id },
    involved: [ownerId],
    detail: `${k.label} (${k.prefix}...)`,
  });
}

/** Who is calling: the agent a bearer key acts as. Anything else is unauthorized. */
export async function authenticate(
  d: Deps,
  authorization: string | null,
): Promise<{ key: ApiKey; agent: Agent }> {
  const secret = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (
    !secret ||
    ![API_KEY_PREFIX, ...LEGACY_API_KEY_PREFIXES].some((p) =>
      secret.startsWith(p),
    )
  )
    throw new DomainError(
      "unauthorized",
      "Send your key as: Authorization: Bearer omni_...",
    );
  const key = await d.repos.apiKeys.byHash(hash(secret));
  const agent = key && (await d.repos.agents.get(key.agentId));
  if (!key || !agent || agent.ownerId !== key.ownerId)
    throw new DomainError(
      "unauthorized",
      "That key isn't valid or was revoked.",
    );
  const now = d.now();
  if (
    !key.lastUsedAt ||
    Date.parse(now) - Date.parse(key.lastUsedAt) > TOUCH_EVERY_MS
  )
    await d.repos.apiKeys.save({ ...key, lastUsedAt: now });
  return { key, agent };
}

/**
 * Where this key's agent events are POSTed. Returns the signing secret, made on first
 * use and kept when the URL changes. Null removes the webhook.
 */
export async function setWebhook(
  d: Deps,
  key: ApiKey,
  url: string | null,
): Promise<{ url: string | null; secret: string | null }> {
  if (url === null) {
    await d.repos.apiKeys.save({ ...key, webhookUrl: null });
    return { url: null, secret: null };
  }
  const clean = checkWebhookUrl(url);
  const secret =
    key.webhookSecret ?? `whsec_${randomBytes(24).toString("base64url")}`;
  await d.repos.apiKeys.save({
    ...key,
    webhookUrl: clean,
    webhookSecret: secret,
  });
  return { url: clean, secret };
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i;

/** Https to a public host. Plain http to localhost only while developing. */
function checkWebhookUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new DomainError("bad_request", "That isn't a URL.");
  }
  const dev = process.env.NODE_ENV !== "production";
  const local = PRIVATE_HOST.test(u.hostname);
  if (u.protocol === "https:" && !local) return u.toString();
  if (dev && local && (u.protocol === "http:" || u.protocol === "https:"))
    return u.toString();
  throw new DomainError(
    "bad_request",
    "Webhooks need an https URL on a public host.",
  );
}
