import { ClaudeAgentProvider } from "@/adapters/agent/claude/provider";
import { DeepgramTranscriber } from "@/adapters/asr/deepgram";
import { FakeAgent, FakeTranscriber } from "@/adapters/fake";
import { InMemoryStore } from "@/adapters/store/in-memory";
import { createServerClient } from "@/adapters/store/supabase/client";
import { SupabaseStore } from "@/adapters/store/supabase/store";
import type { BlobStore, Memory, Repos } from "@/core";
import type { Deps } from "@/pipeline";

/**
 * The one place adapters get chosen. Supabase when its env vars are set,
 * otherwise the in memory store (handy for running without a database).
 */

// Module scoped, so a hot reload of any adapter rebuilds deps with the new code.
let deps: Deps | undefined;

export function getDeps(): Deps {
  return (deps ??= build());
}

function build(): Deps {
  const store = buildStore();
  // Canned speech and agent: click through everything without keys or credits.
  const fake = process.env.PRESENCE_FAKE_AI === "1";
  if (fake)
    console.warn(
      "[presence] PRESENCE_FAKE_AI=1: using canned transcripts and notes.",
    );
  return {
    repos: store.repos,
    blobs: store,
    memory: store,
    asr: fake
      ? new FakeTranscriber()
      : new DeepgramTranscriber(required("DEEPGRAM_API_KEY")),
    agent: fake
      ? new FakeAgent()
      : new ClaudeAgentProvider(
          required("ANTHROPIC_API_KEY"),
          process.env.ANTHROPIC_WORKSPACE_ID || undefined,
        ),
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  };
}

function buildStore(): BlobStore & Memory & { repos: Repos } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (url && secret) return new SupabaseStore(createServerClient(url, secret));
  console.warn(
    "[presence] Supabase env not set; using the in memory store. Data is lost on restart.",
  );
  // Only the in memory data needs to survive hot reloads.
  const g = globalThis as unknown as { __presenceMemoryStore?: InMemoryStore };
  return (g.__presenceMemoryStore ??= new InMemoryStore());
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. See .env.example.`);
  return v;
}
