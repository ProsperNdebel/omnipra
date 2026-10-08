import {
  DomainError,
  type AgentId,
  type ISODate,
  type ManifestationId,
  type MemoryId,
  type ObservationId,
} from "./ids";

/**
 * What the agent knows, split by what kind of knowing it is. The split matters
 * because each kind is trusted differently.
 *
 * identity: who the agent is and how it behaves ("lead with the number").
 * owner: facts and preferences about the person it represents.
 * goal: standing objectives that outlive any one event.
 * experience: something it encountered in a room. A record of what was said,
 *   never a belief about its owner, and never assumed true.
 */
export type MemoryKind = "identity" | "owner" | "goal" | "experience";
export const MEMORY_KINDS: readonly MemoryKind[] = [
  "identity",
  "owner",
  "goal",
  "experience",
];

/** Where a memory came from. This is what keeps overheard things apart from what the owner said. */
export type MemorySource =
  /** The owner wrote it in directly. */
  | { type: "owner" }
  /** The owner said it to the agent (during a session, or in Ask) and the agent picked it up. */
  | { type: "said"; manifestationId: ManifestationId | null; quote: string }
  /** The agent heard it in a room. */
  | {
      type: "heard";
      manifestationId: ManifestationId;
      observationIds: ObservationId[];
    };

/**
 * active: the agent uses it. proposed: the agent wants to remember it and is
 * waiting for the owner, and does not use it until then.
 */
export type MemoryStatus = "active" | "proposed";

export interface AgentMemory {
  id: MemoryId;
  agentId: AgentId;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  source: MemorySource;
  createdAt: ISODate;
  updatedAt: ISODate;
}

const MAX_TEXT = 400;

/**
 * The trust rule. Something heard in a room can only ever be an experience: no
 * speaker gets to change who the agent is, what its owner wants, or its goals.
 */
export function allowedKinds(source: MemorySource): readonly MemoryKind[] {
  switch (source.type) {
    case "heard":
      return ["experience"];
    case "said":
      return ["identity", "owner", "goal"];
    case "owner":
      return MEMORY_KINDS;
  }
}

/** Pure. Owner written memories are active at once; anything the agent picked up waits for the owner. */
export function newMemory(
  input: {
    id: MemoryId;
    agentId: AgentId;
    kind: MemoryKind;
    text: string;
    source: MemorySource;
  },
  now: ISODate,
): AgentMemory {
  const text = cleanText(input.text);
  if (!allowedKinds(input.source).includes(input.kind)) {
    throw new DomainError(
      "bad_request",
      `A ${input.source.type} memory can't be a ${input.kind} memory.`,
    );
  }
  return {
    ...input,
    text,
    status: input.source.type === "owner" ? "active" : "proposed",
    createdAt: now,
    updatedAt: now,
  };
}

/** keep: accept a proposal as is. edit: correct the wording, which also accepts it. */
export function reviseMemory(
  m: AgentMemory,
  op: "keep" | "edit",
  now: ISODate,
  text?: string,
): AgentMemory {
  if (op === "keep" && m.status === "active") return m;
  return {
    ...m,
    text: op === "edit" ? cleanText(text ?? "") : m.text,
    status: "active",
    updatedAt: now,
  };
}

function cleanText(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) throw new DomainError("bad_request", "A memory can't be empty.");
  if (t.length > MAX_TEXT) {
    throw new DomainError(
      "bad_request",
      `Keep a memory under ${MAX_TEXT} characters.`,
    );
  }
  return t;
}

/** Same memory, different spacing or case. Used to stop the agent proposing what it already has. */
export const sameMemory = (a: string, b: string) => norm(a) === norm(b);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** How many past experiences to bring into any one moment of reasoning. */
const EXPERIENCES_IN_CONTEXT = 8;

/**
 * What the agent actually reasons with: everything active about who it is, who it
 * works for and what it is after, plus the experiences most related to the moment.
 * Proposals are left out until the owner accepts them.
 */
export function memoryInUse(all: AgentMemory[], query: string): AgentMemory[] {
  const active = all.filter((m) => m.status === "active");
  const core = active.filter((m) => m.kind !== "experience");
  const terms = new Set(
    norm(query)
      .split(" ")
      .filter((w) => w.length > 2),
  );
  const experiences = active
    .filter((m) => m.kind === "experience")
    .map((m, i) => ({
      m,
      score:
        norm(m.text)
          .split(" ")
          .filter((w) => terms.has(w)).length *
          10 +
        i / 1000, // ties go to the most recent
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, EXPERIENCES_IN_CONTEXT)
    .map((x) => x.m);
  return [...core, ...experiences];
}

/** What a model may propose remembering. Kind and source are checked by the pipeline, not trusted. */
export interface LearnedFromOwner {
  kind: Exclude<MemoryKind, "experience">;
  text: string;
}
export interface HeardWorthRemembering {
  text: string;
  /** Notes it rests on. A proposal with none is dropped. */
  evidence: ObservationId[];
}
