import { cleanPayload } from "@/core";
import type {
  AgentProvider,
  AnswerInput,
  AnswerResult,
  LearnedFromOwner,
  NewPlanItem,
  PlanInput,
  ActRequest,
  PrepareInput,
  PreparedAction,
  NewSuggestion,
  ReflectInput,
  AudioInput,
  BriefInput,
  BriefResult,
  ConverseInput,
  ConverseResult,
  ObserveInput,
  ObserveResult,
  TranscriptionProvider,
  TranscriptSegment,
} from "@/core";

/**
 * Canned speech and agent, for running the whole loop without API keys or credits.
 * Turn on with PRESENCE_FAKE_AI=1. Never used unless that is set.
 */

const LINES = [
  "We launched three weeks ago and already have four signed contracts.",
  "Our sales cycle is about two weeks and half of our demos close.",
  "We're starting with bid coordination for electrical and plumbing subcontractors.",
];

export class FakeTranscriber implements TranscriptionProvider {
  async transcribe(
    input: AudioInput,
  ): Promise<Omit<TranscriptSegment, "id" | "manifestationId">[]> {
    const i = Math.floor(input.offsetSec / 20) % LINES.length;
    return [
      {
        speaker: "S0",
        text: LINES[i]!,
        startSec: input.offsetSec + 1,
        endSec: input.offsetSec + 6,
      },
    ];
  }
}

export class FakeAgent implements AgentProvider {
  async observe({
    window,
    conversation,
    requests,
    hostTakesRequests,
    mission,
  }: ObserveInput): Promise<ObserveResult> {
    const launch = window.find((s) => /launched/i.test(s.text));
    const nudged = conversation.some((m) => m.kind === "nudge");
    return {
      observations: window.map((s) => ({
        kind: "number",
        basis: "claim",
        speaker: null,
        // Anything about contracts advances the first plan item.
        planItem: /contract/i.test(s.text)
          ? (mission.plan?.[0]?.id ?? null)
          : null,
        text: `Heard: ${s.text}`,
        importance: 2,
        alert: null,
        entities: [],
        evidence: [s.id],
      })),
      nudges:
        launch && !nudged
          ? [
              {
                text: "They have paying customers weeks after launch. Worth knowing for your own go to market.",
                evidence: [launch.id],
              },
            ]
          : [],
      asks:
        hostTakesRequests && requests.length === 0
          ? [
              {
                ask: "Could you ask what the four contracts are worth?",
                why: "They gave counts but no revenue.",
              },
            ]
          : [],
    };
  }

  async converse({
    message,
    requests,
  }: ConverseInput): Promise<ConverseResult> {
    const m = message.toLowerCase();
    const yes = m.startsWith("yes");
    return {
      reply: yes ? "Sending it to the host." : "Understood.",
      addOrders: m.startsWith("focus") ? [message] : [],
      asks:
        !yes && m.includes("ask")
          ? [{ ask: message, why: "You asked me to." }]
          : [],
      approve: yes
        ? requests.filter((r) => r.status === "proposed").map((r) => r.id)
        : [],
      learn: learnFrom(message),
      act: actFrom(message),
    };
  }

  async brief({ observations }: BriefInput): Promise<BriefResult> {
    return {
      headline: ["Early traction: contracts signed within weeks of launch."],
      followUps: [
        { name: "The founders", why: "Fast sales cycle worth hearing about." },
      ],
      openQuestions: ["What do the contracts pay?"],
      markdown: "",
      cites: {
        headline: [observations.map((o) => o.id)],
        followUps: [observations.slice(0, 1).map((o) => o.id)],
      },
      remember: observations.length
        ? [
            {
              text: `Someone said: ${observations[0]!.text}`,
              evidence: [observations[0]!.id],
            },
          ]
        : [],
    };
  }

  async answer({
    observations,
    history,
    memories,
    question,
  }: AnswerInput): Promise<AnswerResult> {
    const prior = history.length ? `(Turn ${history.length + 1}.) ` : "";
    const goals = memories.filter((m) => m.kind === "goal");
    const answer = /goal/i.test(question)
      ? goals.length
        ? `Your goals: ${goals.map((g) => g.text).join("; ")}`
        : "You haven't given me any goals."
      : observations.length
        ? `From my notes: ${observations[0]!.text}`
        : "I did not observe that.";
    return {
      answer: prior + answer,
      learn: learnFrom(question),
      act: actFrom(question),
    };
  }

  async plan({ memories }: PlanInput): Promise<NewPlanItem[]> {
    const goals = memories.filter((m) => m.kind === "goal");
    return [
      ...goals.map((g) => ({
        goalId: g.id,
        goal: g.text,
        watchFor: `Anyone whose work touches: ${g.text}`,
      })),
      {
        goalId: null,
        goal: "This mission",
        watchFor: "Traction numbers: contracts, revenue, customers.",
      },
    ];
  }

  async reflect({ notes, earlier }: ReflectInput): Promise<NewSuggestion[]> {
    const here = notes[0];
    if (!here) return [];
    const there = earlier[0];
    return [
      there
        ? {
            kind: "connection",
            text: "The same traction story came up at two events.",
            why: "Worth comparing notes with both founders.",
            offer: "intro",
            target: "The founders",
            evidence: [here.id, there.note.id],
          }
        : {
            kind: "follow_up",
            text: "The founders here are worth a message.",
            why: "Fast sales cycle, close to what you're building.",
            offer: "message",
            target: "The founders",
            evidence: [here.id],
          },
    ];
  }

  async prepare({
    kind,
    instruction,
    target,
    notes,
  }: PrepareInput): Promise<PreparedAction> {
    const where = notes[0]?.eventTitle ?? "the event";
    const raw: Record<string, unknown> = {
      email: {
        to: "",
        subject: `Following up from ${where}`,
        body: `Hi ${target ?? "there"}, I heard about your talk at ${where}. Would love to compare notes.\n\n[Your name]`,
      },
      event: {
        title: `Call with ${target ?? "them"}`,
        start: "",
        durationMin: 30,
        details: instruction,
      },
      contact: {
        name: target ?? "Unknown",
        company: "",
        role: "",
        email: "",
        notes: `Heard at ${where}.`,
      },
      task: { text: instruction, due: "" },
      note: {
        title: instruction.slice(0, 60),
        body: notes.map((n) => n.note.text).join("\n") || instruction,
      },
    }[kind] as Record<string, unknown>;
    return { payload: cleanPayload(kind, raw), why: "You asked for it." };
  }
}

/** Canned learning: "remember ..." becomes an owner fact, "my goal is ..." a goal. */
function learnFrom(message: string): LearnedFromOwner[] {
  const goal = message.match(/my goal is (.+)/i)?.[1];
  if (goal) return [{ kind: "goal", text: goal.trim() }];
  const fact = message.match(/remember (?:that )?(.+)/i)?.[1];
  return fact ? [{ kind: "owner", text: fact.trim() }] : [];
}

/** Canned acting: "email ..." prepares an email, "remind me to ..." a to do. */
function actFrom(message: string): ActRequest[] {
  const email = message.match(/^email (\w+)/i)?.[1];
  if (email) return [{ kind: "email", instruction: message, target: email }];
  const contact = message.match(/save (\w+) as a contact/i)?.[1];
  if (contact) return [{ kind: "contact", instruction: message, target: contact }];
  const call = message.match(/schedule a call with (\w+)/i)?.[1];
  if (call) return [{ kind: "event", instruction: message, target: call }];
  const task = message.match(/remind me to (.+)/i)?.[1];
  return task ? [{ kind: "task", instruction: task.trim(), target: null }] : [];
}
