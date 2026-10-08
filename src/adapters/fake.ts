import type {
  AgentProvider,
  AnswerInput,
  AudioInput,
  BriefInput,
  Briefing,
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
    };
  }

  async brief({ observations }: BriefInput): Promise<Briefing> {
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
    };
  }

  async answer({ observations, history }: AnswerInput): Promise<string> {
    const prior = history.length ? `(Turn ${history.length + 1}.) ` : "";
    return (
      prior +
      (observations.length
        ? `From my notes: ${observations[0]!.text}`
        : "I did not observe that.")
    );
  }
}
