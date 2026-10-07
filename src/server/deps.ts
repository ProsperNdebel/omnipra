import { ClaudeAgentProvider } from "@/adapters/agent/claude/provider";
import { DeepgramTranscriber } from "@/adapters/asr/deepgram";
import { InMemoryStore } from "@/adapters/store/in-memory";
import { createServerClient } from "@/adapters/store/supabase/client";
import { SupabaseStore } from "@/adapters/store/supabase/store";
import type { BlobStore, Memory, Repos } from "@/core";
import type { Deps } from "@/pipeline";

/**
 * The one place adapters get chosen. Supabase when its env vars are set,
 * otherwise the in memory store (handy for running without a database).
 */
export function getDeps(): Deps {
  const g = globalThis as unknown as { __presenceDeps?: Deps };
  // Survive Next dev hot reloads so clients and the in memory store aren't rebuilt on every save.
  return (g.__presenceDeps ??= build());
}

function build(): Deps {
  const store = buildStore();
  return {
    repos: store.repos,
    blobs: store,
    memory: store,
    asr: new DeepgramTranscriber(required("DEEPGRAM_API_KEY")),
    agent: new ClaudeAgentProvider(required("ANTHROPIC_API_KEY"), process.env.ANTHROPIC_WORKSPACE_ID || undefined),
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  };
}

function buildStore(): BlobStore & Memory & { repos: Repos } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (url && secret) return new SupabaseStore(createServerClient(url, secret));
  console.warn("[presence] Supabase env not set; using the in memory store. Data is lost on restart.");
  return new InMemoryStore();
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. See .env.example.`);
  return v;
}
