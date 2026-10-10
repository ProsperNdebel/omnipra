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
  NewPlanItem,
  PlanInput,
  AssessInput,
  SeeInput,
  OrchestrateInput,
  ScoutInput,
  ScoutResult,
  Orchestration,
  ActRequest,
  PrepareInput,
  PreparedAction,
  NewSuggestion,
  ReflectInput,
  NewAsk,
  NewObservation,
  ObservationId,
  ObservationKind,
  ObserveInput,
  ObserveResult,
  SegmentId,
} from "@/core";
import {
  ACTION_KINDS,
  cleanPayload,
  OBSERVATION_BASES,
  SUGGESTION_OFFERS,
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
    // Plan refs (p1, p2) back to plan item ids; unknown refs mean no item.
    const planIds = new Map(
      (input.mission.plan ?? []).map((p, i) => [P.planRef(i), p.id]),
    );
    return {
      observations: (out.observations ?? []).flatMap((o) => {
        const parsed = parseObservation(o, planIds);
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
      act?: unknown;
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
      act: parseAct(out.act),
    };
  }

  async brief({
    agent,
    memories,
    mission,
    event,
    observations,
  }: BriefInput): Promise<BriefResult> {
    // Long events make long briefings; 4096 ran out on a three hour session.
    const out = (await this.json(this.models.brief, 12000, {
      system: P.briefSystem(agent, memories, mission, event),
      user: P.briefUser(observations, mission.plan),
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
    recentActions,
  }: AnswerInput): Promise<AnswerResult> {
    const out = (await this.json(this.models.answer, 1536, {
      system: P.answerSystem(agent, memories),
      // Earlier turns as real conversation, so follow ups resolve naturally.
      history: history.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]),
      user: P.answerUser(question, observations, eventTitles, recentActions),
      schema: ANSWER_SCHEMA,
    })) as { answer?: unknown; learn?: unknown; act?: unknown };
    return {
      answer: typeof out.answer === "string" ? out.answer.trim() : "",
      learn: parseLearn(out.learn),
      act: parseAct(out.act),
    };
  }

  async plan(input: PlanInput): Promise<NewPlanItem[]> {
    const out = (await this.json(this.models.brief, 1536, {
      system: P.planSystem(input),
      user: P.planUser(input),
      schema: PLAN_SCHEMA,
    })) as { items?: { goal?: unknown; watchFor?: unknown }[] };
    const goals = input.memories.filter((m) => m.kind === "goal");
    const byRef = new Map(goals.map((g, i) => [P.goalRef(i), g]));
    return (Array.isArray(out.items) ? out.items : []).flatMap((item) => {
      if (typeof item?.watchFor !== "string" || !item.watchFor.trim())
        return [];
      // A ref the model invented falls back to the mission, never to a made up goal.
      const goal = byRef.get(
        String(item.goal ?? "")
          .trim()
          .toLowerCase(),
      );
      return [
        {
          goalId: goal?.id ?? null,
          goal: goal?.text ?? "This mission",
          watchFor: item.watchFor.trim(),
        },
      ];
    });
  }

  async reflect(input: ReflectInput): Promise<NewSuggestion[]> {
    const all = P.reflectNotes(input);
    if (all.length === 0) return [];
    const out = (await this.json(this.models.brief, 2048, {
      system: P.reflectSystem(input),
      user: P.reflectUser(input),
      schema: REFLECT_SCHEMA,
    })) as { suggestions?: Record<string, unknown>[] };
    const byRef = new Map(all.map((n, i) => [P.noteRef(i), n.note.id]));
    return (Array.isArray(out.suggestions) ? out.suggestions : [])
      .flatMap((r): NewSuggestion[] => {
        const kind = SUGGESTION_KINDS.find((k) => k === r?.kind);
        if (!kind || typeof r.text !== "string" || !r.text.trim()) return [];
        const offer = OFFERS.find((o) => o === r.offer) ?? null;
        const target =
          typeof r.target === "string" && r.target.trim()
            ? r.target.trim()
            : null;
        return [
          {
            kind,
            text: r.text.trim(),
            why: typeof r.why === "string" ? r.why.trim() : "",
            offer,
            target,
            evidence: [...new Set(strings(r.cites))].flatMap((ref) => {
              const id = byRef.get(ref.trim().toLowerCase());
              return id ? [id] : [];
            }),
          },
        ];
      })
      .slice(0, 3);
  }

  async prepare(input: PrepareInput): Promise<PreparedAction> {
    const out = (await this.json(this.models.answer, 2048, {
      system: P.prepareSystem(input),
      user: P.prepareUser(input),
      schema: PREPARE_SCHEMA,
    })) as Record<string, unknown>;
    return {
      payload: cleanPayload(input.kind, out),
      why: typeof out.why === "string" ? out.why.trim() : "",
    };
  }

  async orchestrate(input: OrchestrateInput): Promise<Orchestration> {
    const out = (await this.json(this.models.observe, 1536, {
      system: P.orchestrateSystem(input),
      user: P.orchestrateUser(input),
      schema: ORCHESTRATE_SCHEMA,
    })) as {
      rooms?: { room?: unknown; value?: unknown; status?: unknown }[];
      focus?: { room?: unknown; why?: unknown };
      pattern?: { text?: unknown; cites?: unknown };
    };
    const roomOf = new Map(
      input.rooms.map((r, i) => [
        P.roomRef(i).toLowerCase(),
        r.manifestationId,
      ]),
    );
    const ref = (v: unknown) =>
      roomOf.get(
        String(v ?? "")
          .trim()
          .toLowerCase(),
      );
    const notes = P.orchestrateNotes(input);
    const noteOf = new Map(notes.map((o, i) => [P.noteRef(i), o.id]));
    const values = ["high", "medium", "low"] as const;

    const rooms = (Array.isArray(out.rooms) ? out.rooms : []).flatMap((r) => {
      const id = ref(r?.room);
      const value = values.find((v) => v === r?.value);
      return id && value
        ? [
            {
              manifestationId: id,
              value,
              status: String(r.status ?? "").trim(),
            },
          ]
        : [];
    });
    const focusId = ref(out.focus?.room);
    const why = String(out.focus?.why ?? "").trim();
    const text = String(out.pattern?.text ?? "").trim();
    return {
      rooms,
      focus: focusId && why ? { manifestationId: focusId, why } : null,
      pattern: text
        ? {
            text,
            evidence: strings(out.pattern?.cites).flatMap((c) => {
              const id = noteOf.get(c.trim().toLowerCase());
              return id ? [id] : [];
            }),
          }
        : null,
    };
  }

  async scout(input: ScoutInput): Promise<ScoutResult> {
    if (input.candidates.length === 0) return { picks: [], skipped: [] };
    const out = (await this.json(this.models.brief, 3072, {
      system: P.scoutSystem(input),
      user: P.scoutUser(input),
      schema: SCOUT_SCHEMA,
    })) as {
      picks?: { host?: unknown; why?: unknown; instructions?: unknown }[];
      skipped?: { event?: unknown; why?: unknown }[];
    };
    const hostOf = new Map(
      input.candidates.flatMap((c, i) =>
        c.hosts.map(
          (h, j) =>
            [
              P.hostRef(i, j),
              { eventId: c.event.id, hostId: h.hostId },
            ] as const,
        ),
      ),
    );
    const eventOf = new Map(
      input.candidates.map((c, i) => [P.eventRef(i), c.event.id]),
    );
    const key = (v: unknown) =>
      String(v ?? "")
        .trim()
        .toLowerCase();
    return {
      picks: (Array.isArray(out.picks) ? out.picks : []).flatMap((p) => {
        const h = hostOf.get(key(p?.host));
        return h
          ? [
              {
                ...h,
                why: String(p.why ?? "").trim(),
                instructions: String(p.instructions ?? "").trim(),
              },
            ]
          : [];
      }),
      skipped: (Array.isArray(out.skipped) ? out.skipped : []).flatMap((s) => {
        const eventId = eventOf.get(key(s?.event));
        return eventId ? [{ eventId, why: String(s.why ?? "").trim() }] : [];
      }),
    };
  }

  async assess(
    input: AssessInput,
  ): Promise<{ relevant: boolean; why: string }> {
    const out = (await this.json(this.models.observe, 512, {
      system: P.assessSystem(input),
      user: P.assessUser(input),
      schema: ASSESS_SCHEMA,
    })) as { relevant?: unknown; why?: unknown };
    return {
      relevant: out.relevant === true,
      why: typeof out.why === "string" ? out.why.trim() : "",
    };
  }

  async see(input: SeeInput): Promise<NewObservation[]> {
    const out = (await this.json(this.models.observe, 2048, {
      system: P.seeSystem(input),
      user: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: input.image.mimeType as
              "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: Buffer.from(input.image.bytes).toString("base64"),
          },
        },
        { type: "text", text: P.seeUser(input) },
      ],
      schema: SEE_SCHEMA,
    })) as { observations?: unknown[] };
    const planIds = new Map(
      (input.mission.plan ?? []).map((p, i) => [P.planRef(i), p.id]),
    );
    return (out.observations ?? []).flatMap((o) => {
      const parsed = parseObservation(o, planIds);
      return parsed ? [{ ...parsed, evidence: [] }] : [];
    });
  }

  private async json(
    model: string,
    maxTokens: number,
    args: {
      system: string;
      user: string | Anthropic.ContentBlockParam[];
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
          "basis",
          "speaker",
          "plan",
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
          basis: { type: "string", enum: OBSERVATION_BASES },
          speaker: {
            type: "string",
            description:
              "Who said it, as identified in the room, or an empty string.",
          },
          plan: {
            type: "string",
            description:
              "Ref of the plan item this advances (like p2), or an empty string.",
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

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["goal", "watchFor"],
        properties: {
          goal: {
            type: "string",
            description: 'The goal ref this serves (like g1), or "mission".',
          },
          watchFor: { type: "string" },
        },
      },
    },
  },
};

const SUGGESTION_KINDS = ["connection", "follow_up", "question"] as const;
const OFFERS = SUGGESTION_OFFERS;

const REFLECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      description: "At most three. Often fewer, sometimes none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "why", "offer", "target", "cites"],
        properties: {
          kind: { type: "string", enum: SUGGESTION_KINDS },
          text: { type: "string" },
          why: { type: "string" },
          offer: {
            type: "string",
            enum: [...OFFERS, "none"],
          },
          target: {
            type: "string",
            description:
              "Who an intro or message is for, as named in the notes, or an empty string.",
          },
          cites: CITES,
        },
      },
    },
  },
};

const ACT = {
  type: "array",
  description: "Actions your owner just asked you to prepare. Usually empty.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "instruction", "target"],
    properties: {
      kind: { type: "string", enum: ACTION_KINDS },
      instruction: { type: "string" },
      target: { type: "string", description: "Who it is for, or empty." },
    },
  },
};

const PREPARE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "why",
    "to",
    "subject",
    "body",
    "title",
    "start",
    "durationMin",
    "details",
    "name",
    "company",
    "role",
    "email",
    "notes",
    "text",
    "due",
  ],
  properties: {
    why: { type: "string" },
    to: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    title: { type: "string" },
    start: { type: "string" },
    durationMin: { type: "integer" },
    details: { type: "string" },
    name: { type: "string" },
    company: { type: "string" },
    role: { type: "string" },
    email: { type: "string" },
    notes: { type: "string" },
    text: { type: "string" },
    due: { type: "string" },
  },
};

const ORCHESTRATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rooms", "focus", "pattern"],
  properties: {
    rooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["room", "value", "status"],
        properties: {
          room: { type: "string", description: "Room ref, like R1." },
          value: { type: "string", enum: ["high", "medium", "low"] },
          status: { type: "string" },
        },
      },
    },
    focus: {
      type: "object",
      additionalProperties: false,
      required: ["room", "why"],
      description: "Empty strings when no room clearly matters most.",
      properties: { room: { type: "string" }, why: { type: "string" } },
    },
    pattern: {
      type: "object",
      additionalProperties: false,
      required: ["text", "cites"],
      description: "Empty text when there is no pattern across rooms.",
      properties: { text: { type: "string" }, cites: CITES },
    },
  },
};

const SCOUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["picks", "skipped"],
  properties: {
    picks: {
      type: "array",
      description: "Best first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["host", "why", "instructions"],
        properties: {
          host: { type: "string", description: "Host ref, like e2h1." },
          why: { type: "string" },
          instructions: { type: "string" },
        },
      },
    },
    skipped: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["event", "why"],
        properties: {
          event: { type: "string", description: "Event ref, like e3." },
          why: { type: "string" },
        },
      },
    },
  },
};

const ASSESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["relevant", "why"],
  properties: {
    relevant: { type: "boolean" },
    why: { type: "string" },
  },
};

const SEE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observations"],
  properties: {
    observations: {
      type: "array",
      description: "What in the image matters to your owner. Empty is fine.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "text",
          "importance",
          "alert",
          "basis",
          "speaker",
          "plan",
          "entities",
        ],
        properties: {
          kind: { type: "string", enum: KINDS },
          text: { type: "string" },
          importance: { type: "integer", enum: [1, 2, 3] },
          alert: { type: "string" },
          basis: { type: "string", enum: OBSERVATION_BASES },
          speaker: { type: "string" },
          plan: { type: "string" },
          entities: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const CONVERSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "addOrders", "asks", "approve", "learn", "act"],
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
    act: ACT,
  },
};

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "learn", "act"],
  properties: {
    answer: { type: "string", description: "Your answer to your owner." },
    learn: LEARN,
    act: ACT,
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
function parseObservation(
  o: unknown,
  planIds: Map<string, string>,
): NewObservation | null {
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
    basis:
      OBSERVATION_BASES.find((b) => b === String(r.basis).toLowerCase()) ??
      "claim",
    speaker:
      typeof r.speaker === "string" && r.speaker.trim()
        ? r.speaker.trim().slice(0, 120)
        : null,
    planItem:
      planIds.get(
        String(r.plan ?? "")
          .trim()
          .toLowerCase(),
      ) ?? null,
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

function parseAct(raw: unknown): ActRequest[] {
  return (Array.isArray(raw) ? raw : []).flatMap((a) => {
    const kind = ACTION_KINDS.find((k) => k === a?.kind);
    if (!kind || typeof a.instruction !== "string" || !a.instruction.trim())
      return [];
    return [
      {
        kind,
        instruction: a.instruction.trim(),
        target:
          typeof a.target === "string" && a.target.trim()
            ? a.target.trim()
            : null,
      },
    ];
  });
}

function parseLearn(raw: unknown): LearnedFromOwner[] {
  return (Array.isArray(raw) ? raw : []).flatMap((l) =>
    LEARN_KINDS.has(l?.kind) && typeof l?.text === "string" && l.text.trim()
      ? [{ kind: l.kind, text: l.text.trim() }]
      : [],
  );
}
