import type {
  AgentProvider,
  AnswerInput,
  AudioInput,
  BriefInput,
  Briefing,
  NewObservation,
  ObserveInput,
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
  async observe({ window }: ObserveInput): Promise<NewObservation[]> {
    return window.map((s) => ({
      kind: "number",
      text: `Heard: ${s.text}`,
      importance: 2,
      alert: null,
      entities: [],
      evidence: [s.id],
    }));
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

  async answer({ observations }: AnswerInput): Promise<string> {
    return observations.length
      ? `From my notes: ${observations[0]!.text}`
      : "I did not observe that.";
  }
}
