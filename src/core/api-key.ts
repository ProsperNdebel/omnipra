import type { AgentId, ApiKeyId, ISODate, UserId } from "./ids";

/**
 * Lets an outside agent act as one Omnipra agent, with exactly its owner's rights
 * over that agent and nothing else. Only a hash of the secret is stored.
 */
export interface ApiKey {
  id: ApiKeyId;
  agentId: AgentId;
  ownerId: UserId;
  label: string;
  /** The first characters, so the owner can tell keys apart. */
  prefix: string;
  /** SHA-256 of the full secret. */
  hash: string;
  createdAt: ISODate;
  lastUsedAt: ISODate | null;
  revokedAt: ISODate | null;
  /** Where to POST this agent's events. Https only. */
  webhookUrl: string | null;
  /** Signs each delivery (HMAC SHA-256) so the receiver knows it came from Omnipra. */
  webhookSecret: string | null;
}

export const API_KEY_PREFIX = "omni_";
/** Keys made before the rename still work. */
export const LEGACY_API_KEY_PREFIXES = ["pres_"];
