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
 * observe and brief force a tool call, so output is schema shaped JSON rather than prose we have to parse.
 */
export class ClaudeAgentProvider implements AgentProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    workspaceId?: string,
    private readonly models = { observe: "claude-sonnet-5-5", brief: "claude-sonnet-5-5", answer: "claude-sonnet-5-5" },
  ) {
    // Keys not scoped to a workspace must name one on every request.
    this.client = new Anthropic({
      apiKey,
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
  }

  async observe({ agent, mission, event, window, recent }: ObserveInput): Promise<NewObservation[]> {
    const input = await this.callTool(this.models.observe, 2048, {
      system: P.observeSystem(agent, mission, event),
      user: P.observeUser(window, recent),
      tool: RECORD_OBSERVATIONS,
    });
    const raw = (input as { observations?: unknown[] }).observations ?? [];
    return raw.flatMap((o) => {
      const parsed = parseObservation(o);
      return parsed ? [parsed] : [];
    });
  }

  async brief({ agent, mission, event, observations }: BriefInput): Promise<Briefing> {
    const input = (await this.callTool(this.models.brief, 4096, {
      system: P.briefSystem(agent, mission, event),
      user: P.briefUser(observations),
      tool: WRITE_BRIEFING,
    })) as Partial<Briefing>;
    return {
      headline: strings(input.headline),
      followUps: Array.isArray(input.followUps)
        ? input.followUps.filter((f) => typeof f?.name === "string").map((f) => ({ name: f.name, why: String(f.why ?? "") }))
        : [],
      openQuestions: strings(input.openQuestions),
      markdown: typeof input.markdown === "string" ? input.markdown : "",
    };
  }

  async answer({ agent, question, observations, eventTitles }: AnswerInput): Promise<string> {
    const res = await this.client.messages.create({
      model: this.models.answer,
      max_tokens: 1024,
      system: P.answerSystem(agent),
      messages: [{ role: "user", content: P.answerUser(question, observations, eventTitles) }],
    });
    return res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
  }

  private async callTool(
    model: string,
    maxTokens: number,
    args: { system: string; user: string; tool: Anthropic.Tool },
  ): Promise<unknown> {
    const res = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
      tools: [args.tool],
      tool_choice: { type: "tool", name: args.tool.name },
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error(`Claude returned no ${args.tool.name} call`);
    return block.input;
  }
}

const KINDS: ObservationKind[] = ["insight", "person", "company", "opportunity", "question", "number"];

const RECORD_OBSERVATIONS: Anthropic.Tool = {
  name: "record_observations",
  description: "Record what you observed in this transcript window. An empty list is a valid answer.",
  input_schema: {
    type: "object",
    properties: {
      observations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: KINDS },
            text: { type: "string", description: "One or two sentences, specific, in your own words." },
            importance: { type: "integer", enum: [1, 2, 3] },
            alert: { type: ["string", "null"], description: "The mission alert this matches, verbatim, or null." },
            entities: { type: "array", items: { type: "string" } },
            evidence: { type: "array", items: { type: "string" }, description: "Transcript line ids this rests on." },
          },
          required: ["kind", "text", "importance", "alert", "entities", "evidence"],
        },
      },
    },
    required: ["observations"],
  },
};

const WRITE_BRIEFING: Anthropic.Tool = {
  name: "write_briefing",
  description: "Write the owner's briefing for this session.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "array", items: { type: "string" }, description: "Up to three things the owner must know." },
      followUps: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, why: { type: "string" } },
          required: ["name", "why"],
        },
      },
      openQuestions: { type: "array", items: { type: "string" } },
      markdown: { type: "string", description: "The full briefing in markdown." },
    },
    required: ["headline", "followUps", "openQuestions", "markdown"],
  },
};

/** Model output is untrusted input: validate field by field and drop anything malformed. */
function parseObservation(o: unknown): NewObservation | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.text !== "string" || !KINDS.includes(r.kind as ObservationKind)) return null;
  const importance = r.importance === 3 ? 3 : r.importance === 2 ? 2 : 1;
  return {
    kind: r.kind as ObservationKind,
    text: r.text,
    importance,
    alert: typeof r.alert === "string" && r.alert.length > 0 ? r.alert : null,
    entities: strings(r.entities),
    evidence: strings(r.evidence) as SegmentId[],
  };
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
