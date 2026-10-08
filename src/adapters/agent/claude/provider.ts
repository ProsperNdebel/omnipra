import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentProvider,
  AnswerInput,
  AnswerResult,
  BriefInput,
  BriefResult,
  ConverseInput,
  ConverseResult,
  LearnedFromOwner,
  NewAsk,
  NewObservation,
  ObservationId,
  ObservationKind,
  ObserveInput,
  ObserveResult,
  SegmentId,
} from "@/core";
import * as P from "./prompts";

/**
 * The native agent: Claude behind the AgentProvider port.
 * observe and brief use structured outputs (output_config.format), so the reply is
 * JSON guaranteed to match the schema rather than prose we have to parse.
 */
export class ClaudeAgentProvider implements AgentProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    workspaceId?: string,
    private readonly models = {
      observe: "claude-sonnet-5-5",
      brief: "claude-sonnet-5-5",
      answer: "claude-sonnet-5-5",
    },
  ) {
    // Keys not scoped to a workspace must name one on every request.
    this.client = new Anthropic({
      apiKey,
      defaultHeaders: workspaceId
        ? { "anthropic-workspace-id": workspaceId }
        : undefined,
    });
  }

  async observe(input: ObserveInput): Promise<ObserveResult> {
    const out = (await this.json(this.models.observe, 3072, {
      system: P.observeSystem(input),
      user: P.observeUser(input),
      schema: OBSERVE_SCHEMA,
    })) as {
      observations?: unknown[];
      nudges?: unknown[];
      asks?: unknown[];
    };
    return {
      observations: (out.observations ?? []).flatMap((o) => {
        const parsed = parseObservation(o);
        return parsed ? [parsed] : [];
      }),
      nudges: (out.nudges ?? []).flatMap((n) => {
        const r = n as Record<string, unknown>;
        return typeof r?.text === "string" && r.text.trim()
          ? [
              {
                text: r.text.trim(),
                evidence: strings(r.evidence) as SegmentId[],
              },
            ]
          : [];
      }),
      // Asks only make sense when the host takes them; drop any the model produced anyway.
      asks: input.hostTakesRequests ? parseAsks(out.asks) : [],
    };
  }

  async converse(input: ConverseInput): Promise<ConverseResult> {
    const out = (await this.json(this.models.observe, 1536, {
      system: P.converseSystem(input),
      user: P.converseUser(input),
      schema: CONVERSE_SCHEMA,
    })) as {
      reply?: unknown;
      addOrders?: unknown;
      asks?: unknown;
      approve?: unknown;
      learn?: unknown;
    };
    const byRef = new Map(
      input.requests.map((r, i) => [P.requestRef(i), r] as const),
    );
    return {
      reply: typeof out.reply === "string" ? out.reply.trim() : "",
      addOrders: strings(out.addOrders)
        .map((o) => o.trim())
        .filter(Boolean),
      asks: input.hostTakesRequests ? parseAsks(out.asks) : [],
      // Only proposals can be approved; anything else the model names is ignored.
      approve: strings(out.approve).flatMap((ref) => {
        const r = byRef.get(ref.trim().toLowerCase());
        return r && r.status === "proposed" ? [r.id] : [];
      }),
      learn: parseLearn(out.learn),
    };
  }

  async brief({
    agent,
    memories,
    mission,
    event,
    observations,
  }: BriefInput): Promise<BriefResult> {
    const out = (await this.json(this.models.brief, 4096, {
      system: P.briefSystem(agent, memories, mission, event),
      user: P.briefUser(observations),
      schema: BRIEFING_SCHEMA,
    })) as RawBriefing;

    // Map the model's short refs back to note ids. Refs that don't exist are dropped.
    const byRef = new Map(observations.map((o, i) => [P.noteRef(i), o.id]));
    const resolve = (cites: unknown): ObservationId[] =>
      [...new Set(strings(cites))].flatMap((r) => {
        const id = byRef.get(r.trim().toLowerCase());
        return id ? [id] : [];
      });

    const headline = (Array.isArray(out.headline) ? out.headline : []).filter(
      (h) => typeof h?.text === "string",
    );
    const followUps = (
      Array.isArray(out.followUps) ? out.followUps : []
    ).filter((f) => typeof f?.name === "string");

    return {
      headline: headline.map((h) => h.text),
      followUps: followUps.map((f) => ({
        name: f.name,
        why: String(f.why ?? ""),
      })),
      openQuestions: strings(out.openQuestions),
      markdown: typeof out.markdown === "string" ? out.markdown : "",
      cites: {
        headline: headline.map((h) => resolve(h.cites)),
        followUps: followUps.map((f) => resolve(f.cites)),
      },
      remember: (Array.isArray(out.remember) ? out.remember : [])
        .filter((r) => typeof r?.text === "string" && r.text.trim())
        .map((r) => ({ text: r.text.trim(), evidence: resolve(r.cites) }))
        .filter((r) => r.evidence.length > 0)
        .slice(0, 3),
    };
  }

  async answer({
    agent,
    memories,
    question,
    observations,
    eventTitles,
    history,
  }: AnswerInput): Promise<AnswerResult> {
    const out = (await this.json(this.models.answer, 1536, {
      system: P.answerSystem(agent, memories),
      // Earlier turns as real conversation, so follow ups resolve naturally.
      history: history.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]),
      user: P.answerUser(question, observations, eventTitles),
      schema: ANSWER_SCHEMA,
    })) as { answer?: unknown; learn?: unknown };
    return {
      answer: typeof out.answer === "string" ? out.answer.trim() : "",
      learn: parseLearn(out.learn),
    };
  }

  private async json(
    model: string,
    maxTokens: number,
    args: {
      system: string;
      user: string;
      schema: Record<string, unknown>;
      history?: Anthropic.MessageParam[];
    },
  ): Promise<unknown> {
    const res = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: args.system,
      messages: [...(args.history ?? []), { role: "user", content: args.user }],
      output_config: { format: { type: "json_schema", schema: args.schema } },
    });
    // Both of these can produce output that doesn't match the schema.
    if (res.stop_reason === "max_tokens")
      throw new Error(`Claude ran out of tokens (max_tokens ${maxTokens})`);
    if (res.stop_reason === "refusal")
      throw new Error("Claude declined this request");
    return JSON.parse(textOf(res));
  }
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
}

const KINDS: ObservationKind[] = [
  "insight",
  "person",
  "company",
  "opportunity",
  "question",
  "number",
];

// Structured outputs need additionalProperties: false on every object and all fields required.
// "No alert" is an empty string rather than null to keep the schema to plain types.
const ASKS = {
  type: "array",
  description:
    "Asks for the host. Empty unless one question or action in the room is clearly worth it.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["ask", "why"],
    properties: {
      ask: {
        type: "string",
        description: "Written to the host: short, polite, doable in a minute.",
      },
      why: {
        type: "string",
        description: "Written to the owner: why this is worth asking.",
      },
    },
  },
};

const OBSERVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observations", "nudges", "asks"],
  properties: {
    nudges: {
      type: "array",
      description: "Interruptions for the owner. Usually empty; at most one.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidence"],
        properties: {
          text: {
            type: "string",
            description: "To the owner, why this matters to them right now.",
          },
          evidence: {
            type: "array",
            items: { type: "string" },
            description: "Transcript line ids.",
          },
        },
      },
    },
    asks: ASKS,
    observations: {
      type: "array",
      description:
        "What you observed in this transcript window. An empty list is a valid answer.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "text",
          "importance",
          "alert",
          "entities",
          "evidence",
        ],
        properties: {
          kind: { type: "string", enum: KINDS },
          text: {
            type: "string",
            description: "One or two sentences, specific, in your own words.",
          },
          importance: { type: "integer", enum: [1, 2, 3] },
          alert: {
            type: "string",
            description:
              "The mission alert this matches, verbatim, or an empty string.",
          },
          entities: { type: "array", items: { type: "string" } },
          evidence: {
            type: "array",
            items: { type: "string" },
            description: "Transcript line ids this rests on.",
          },
        },
      },
    },
  },
};

/** Shape the model returns; cites are short refs like "n3". */
interface RawBriefing {
  headline?: { text: string; cites?: unknown }[];
  followUps?: { name: string; why?: string; cites?: unknown }[];
  openQuestions?: unknown;
  markdown?: unknown;
  remember?: { text: string; cites?: unknown }[];
}

const CITES = {
  type: "array",
  items: { type: "string" },
  description: "Refs of the observations this rests on, like n3.",
};

const LEARN = {
  type: "array",
  description:
    "Durable things your owner just told you about themselves, their goals, or how you should behave. Usually empty.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "text"],
    properties: {
      kind: { type: "string", enum: ["owner", "goal", "identity"] },
      text: { type: "string" },
    },
  },
};

const CONVERSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "addOrders", "asks", "approve"],
  properties: {
    reply: { type: "string", description: "Your reply to your owner." },
    addOrders: {
      type: "array",
      items: { type: "string" },
      description:
        "New standing orders, in the owner's words. Empty if nothing changed.",
    },
    asks: ASKS,
    approve: {
      type: "array",
      items: { type: "string" },
      description: "Refs (like r2) of proposed asks the owner just approved.",
    },
    learn: LEARN,
  },
};

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "learn"],
  properties: {
    answer: { type: "string", description: "Your answer to your owner." },
    learn: LEARN,
  },
};

const BRIEFING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "followUps", "openQuestions", "markdown", "remember"],
  properties: {
    headline: {
      type: "array",
      description: "Up to three things the owner must know.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "cites"],
        properties: { text: { type: "string" }, cites: CITES },
      },
    },
    followUps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "why", "cites"],
        properties: {
          name: { type: "string" },
          why: { type: "string" },
          cites: CITES,
        },
      },
    },
    openQuestions: { type: "array", items: { type: "string" } },
    markdown: { type: "string", description: "The full briefing in markdown." },
    remember: {
      type: "array",
      description:
        "At most three things from this session worth remembering at future events. Often empty.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "cites"],
        properties: { text: { type: "string" }, cites: CITES },
      },
    },
  },
};

/** Model output is still validated field by field; anything malformed is dropped. */
function parseObservation(o: unknown): NewObservation | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  // Enum casing can drift from the schema, so compare case insensitively.
  const kind = KINDS.find((k) => k === String(r.kind).toLowerCase());
  if (typeof r.text !== "string" || !kind) return null;
  const importance = r.importance === 3 ? 3 : r.importance === 2 ? 2 : 1;
  return {
    kind,
    text: r.text,
    importance,
    alert:
      typeof r.alert === "string" && r.alert.trim().length > 0
        ? r.alert.trim()
        : null,
    entities: strings(r.entities),
    evidence: strings(r.evidence) as SegmentId[],
  };
}

function parseAsks(v: unknown): NewAsk[] {
  return (Array.isArray(v) ? v : []).flatMap((a) => {
    const r = a as Record<string, unknown>;
    const ask = typeof r?.ask === "string" ? r.ask.trim() : "";
    return ask
      ? [{ ask, why: typeof r.why === "string" ? r.why.trim() : "" }]
      : [];
  });
}

function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

const LEARN_KINDS = new Set(["owner", "goal", "identity"]);

function parseLearn(raw: unknown): LearnedFromOwner[] {
  return (Array.isArray(raw) ? raw : []).flatMap((l) =>
    LEARN_KINDS.has(l?.kind) && typeof l?.text === "string" && l.text.trim()
      ? [{ kind: l.kind, text: l.text.trim() }]
      : [],
  );
}
