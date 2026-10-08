import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentProvider,
  AnswerInput,
  BriefInput,
  Briefing,
  NewObservation,
  ObservationKind,
  ObserveInput,
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

  async observe({
    agent,
    mission,
    event,
    window,
    recent,
  }: ObserveInput): Promise<NewObservation[]> {
    const out = (await this.json(this.models.observe, 2048, {
      system: P.observeSystem(agent, mission, event),
      user: P.observeUser(window, recent),
      schema: OBSERVATIONS_SCHEMA,
    })) as { observations?: unknown[] };
    return (out.observations ?? []).flatMap((o) => {
      const parsed = parseObservation(o);
      return parsed ? [parsed] : [];
    });
  }

  async brief({
    agent,
    mission,
    event,
    observations,
  }: BriefInput): Promise<Briefing> {
    const out = (await this.json(this.models.brief, 4096, {
      system: P.briefSystem(agent, mission, event),
      user: P.briefUser(observations),
      schema: BRIEFING_SCHEMA,
    })) as Partial<Briefing>;
    return {
      headline: strings(out.headline),
      followUps: Array.isArray(out.followUps)
        ? out.followUps
            .filter((f) => typeof f?.name === "string")
            .map((f) => ({ name: f.name, why: String(f.why ?? "") }))
        : [],
      openQuestions: strings(out.openQuestions),
      markdown: typeof out.markdown === "string" ? out.markdown : "",
    };
  }

  async answer({
    agent,
    question,
    observations,
    eventTitles,
  }: AnswerInput): Promise<string> {
    const res = await this.client.messages.create({
      model: this.models.answer,
      max_tokens: 1024,
      system: P.answerSystem(agent),
      messages: [
        {
          role: "user",
          content: P.answerUser(question, observations, eventTitles),
        },
      ],
    });
    return textOf(res).trim();
  }

  private async json(
    model: string,
    maxTokens: number,
    args: { system: string; user: string; schema: Record<string, unknown> },
  ): Promise<unknown> {
    const res = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
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
const OBSERVATIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observations"],
  properties: {
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

const BRIEFING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "followUps", "openQuestions", "markdown"],
  properties: {
    headline: {
      type: "array",
      items: { type: "string" },
      description: "Up to three things the owner must know.",
    },
    followUps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "why"],
        properties: { name: { type: "string" }, why: { type: "string" } },
      },
    },
    openQuestions: { type: "array", items: { type: "string" } },
    markdown: { type: "string", description: "The full briefing in markdown." },
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

function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}
