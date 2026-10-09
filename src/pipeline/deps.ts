import {
  DomainError,
  type ActionExecutor,
  type AgentProvider,
  type BlobStore,
  type ManifestationId,
  type Memory,
  type PaymentGateway,
  type Repos,
  type SessionContext,
  type TranscriptionProvider,
} from "@/core";

/** Everything the pipeline needs, injected. Swap any adapter without touching pipeline code. */
export interface Deps {
  repos: Repos;
  blobs: BlobStore;
  memory: Memory;
  asr: TranscriptionProvider;
  agent: AgentProvider;
  /** Ways to carry out approved actions, in the order they're offered. */
  executors: ActionExecutor[];
  /** Null when payments are off: sessions are settled directly with hosts. */
  payments: PaymentGateway | null;
  now(): string;
  newId(): string;
}

/** Kept as a name for callers; it is the joined session context. */
export type ManifestationContext = SessionContext;

/** One round trip for the session and everything around it. */
export async function loadContext(
  d: Deps,
  id: ManifestationId,
): Promise<ManifestationContext> {
  const [ctx] = await d.repos.manifestations.contexts({ ids: [id] });
  if (!ctx) throw new DomainError("not_found", `manifestation ${id} not found`);
  return ctx;
}
