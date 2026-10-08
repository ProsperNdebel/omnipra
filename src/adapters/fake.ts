import type {
  AgentProvider,
  AnswerInput,
  AnswerResult,
  LearnedFromOwner,
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
  }: ObserveInput): Promise<ObserveResult> {
    const launch = window.find((s) => /launched/i.test(s.text));
    const nudged = conversation.some((m) => m.kind === "nudge");
    return {
      observations: window.map((s) => ({
        kind: "number",
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
    return { answer: prior + answer, learn: learnFrom(question) };
  }
}

/** Canned learning: "remember ..." becomes an owner fact, "my goal is ..." a goal. */
function learnFrom(message: string): LearnedFromOwner[] {
  const goal = message.match(/my goal is (.+)/i)?.[1];
  if (goal) return [{ kind: "goal", text: goal.trim() }];
  const fact = message.match(/remember (?:that )?(.+)/i)?.[1];
  return fact ? [{ kind: "owner", text: fact.trim() }] : [];
}
