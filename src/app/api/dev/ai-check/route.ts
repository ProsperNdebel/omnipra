import type {
  Agent,
  AgentId,
  AgentMemory,
  ManifestationId,
  MemoryId,
  Mission,
  MissionId,
  Observation,
  ObservationId,
  PresenceEvent,
  EventId,
  PresenceInput,
  SegmentId,
  Suggestion,
  SuggestionId,
  TranscriptSegment,
  UserId,
} from "@/core";
import { getDeps } from "@/server/deps";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/dev/ai-check: runs every AI call once against the real providers with a
 * small made up event, and reports pass or fail, time, and a sample of each answer.
 * Off unless OMNIPRA_DEV_CHECKS=1, since it spends real tokens.
 */
export async function GET() {
  if (process.env.OMNIPRA_DEV_CHECKS !== "1")
    return Response.json(
      { error: "Set OMNIPRA_DEV_CHECKS=1 to run this." },
      { status: 404 },
    );

  const d = getDeps();
  const now = new Date().toISOString();
  const id = <T>(s: string) => s as unknown as T;

  const agent: Agent = {
    id: id<AgentId>("00000000-0000-0000-0000-0000000000a1"),
    ownerId: id<UserId>("00000000-0000-0000-0000-0000000000b1"),
    name: "Scout",
    profile:
      "I'm building speech recognition for African languages, starting with Shona, and selling to banks and telecoms in Zimbabwe. At events I want traction numbers, partners and founders worth meeting.",
    style: "Lead with the number. No pleasantries.",
    card: {
      name: "Po, building Inzwi",
      about: "Speech recognition for Shona.",
      contact: "po@example.com",
    },
    lookFor: ["people", "companies", "opportunities", "technical_details"],
    provider: "native",
    createdAt: now,
  };
  const goal: AgentMemory = {
    id: id<MemoryId>("00000000-0000-0000-0000-0000000000c1"),
    agentId: agent.id,
    kind: "goal",
    text: "Find banks that need Shona speech recognition",
    status: "active",
    source: { type: "owner" },
    createdAt: now,
    updatedAt: now,
  };
  const memories = [goal];
  const event: PresenceEvent = {
    id: id<EventId>("00000000-0000-0000-0000-0000000000d1"),
    title: "Fintech in Africa night",
    startsAt: now,
    endsAt: now,
    venue: "San Francisco",
    sourceUrl: null,
    capturePolicy: "public_talk",
  };
  const mission: Mission = {
    id: id<MissionId>("00000000-0000-0000-0000-0000000000e1"),
    agentId: agent.id,
    eventId: event.id,
    instructions: "Capture traction numbers and anyone open to partners.",
    alerts: ["anyone mentions call centers"],
    context: ["memory"],
    requires: ["mic"],
    autonomy: "ask_first",
    orders: [],
    plan: [
      {
        id: "p1",
        goalId: goal.id,
        goal: goal.text,
        watchFor: "Banks talking about call centers or local languages.",
      },
    ],
    createdAt: now,
  };
  const mid = id<ManifestationId>("00000000-0000-0000-0000-0000000000f1");
  const window: TranscriptSegment[] = [
    ["s1", 0, "S0", "Hi everyone, I lead digital at CBZ Bank in Harare."],
    [
      "s2",
      6,
      "S0",
      "Our call center handles about forty thousand calls a month, most of them in Shona.",
    ],
    [
      "s3",
      14,
      "S1",
      "We are looking for partners who can do Shona speech recognition, nobody does it well yet.",
    ],
  ].map(([sid, at, spk, text]) => ({
    id: id<SegmentId>(`${mid}:check:${sid}`),
    manifestationId: mid,
    speaker: spk as string,
    text: text as string,
    startSec: at as number,
    endSec: (at as number) + 5,
  }));
  const note: Observation = {
    id: id<ObservationId>("00000000-0000-0000-0000-000000000101"),
    agentId: agent.id,
    manifestationId: mid,
    kind: "opportunity",
    text: "CBZ Bank's head of digital said they want a Shona speech recognition partner for a call center taking about 40,000 calls a month.",
    importance: 3,
    alert: "anyone mentions call centers",
    basis: "claim",
    speaker: "CBZ Bank's head of digital",
    planItem: "p1",
    hostRequestId: null,
    entities: ["CBZ Bank"],
    evidence: window.map((s) => s.id),
    frames: [],
    atSec: 0,
    createdAt: now,
  };
  const presence: PresenceInput = {
    agent,
    memories,
    mission,
    event,
    recent: [],
    conversation: [],
    requests: [],
    hostTakesRequests: true,
    related: [],
    recentActions: [],
  };
  // 1x1 white PNG: enough to prove the vision call works end to end.
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
      "base64",
    ),
  );
  // One second of silence as 16 bit mono WAV: proves the speech key works.
  const wav = silentWav(1);

  const checks: [string, () => Promise<unknown>][] = [
    [
      "speech (Deepgram key)",
      () =>
        d.asr.transcribe({ bytes: wav, mimeType: "audio/wav", offsetSec: 0 }),
    ],
    [
      "plan",
      () =>
        d.agent.plan({
          agent,
          memories,
          mission: { ...mission, plan: null },
          event,
        }),
    ],
    ["notes from the room", () => d.agent.observe({ ...presence, window })],
    [
      "what it sees",
      () =>
        d.agent.see({
          ...presence,
          image: { bytes: png, mimeType: "image/png" },
          caption: "a blank test image",
        }),
    ],
    [
      "live chat",
      () =>
        d.agent.converse({
          ...presence,
          recent: [note],
          message:
            "Great. Ask them which vendor they use today. Also remember I prefer warm intros.",
        }),
    ],
    [
      "briefing",
      () =>
        d.agent.brief({
          agent,
          memories,
          mission,
          event,
          observations: [note],
        }),
    ],
    [
      "suggestions",
      () =>
        d.agent.reflect({
          agent,
          memories,
          event,
          notes: [note],
          earlier: [],
          open: [] as Pick<Suggestion, "text">[],
          recentActions: [],
        }),
    ],
    [
      "Ask",
      () =>
        d.agent.answer({
          agent,
          memories,
          question: "Which bank should I follow up with?",
          observations: [note],
          eventTitles: { [mid]: event.title },
          history: [],
          recentActions: [],
        }),
    ],
    [
      "prepare an email",
      () =>
        d.agent.prepare({
          kind: "email",
          instruction: "Follow up with CBZ Bank about their call center",
          target: "CBZ Bank's head of digital",
          agent,
          memories,
          notes: [{ note, eventTitle: event.title }],
          recentActions: [],
        }),
    ],
    [
      "multi room",
      () =>
        d.agent.orchestrate({
          agent,
          memories,
          rooms: [
            {
              manifestationId: mid,
              eventTitle: event.title,
              plan: mission.plan ?? [],
              notes: [note],
            },
            {
              manifestationId: id<ManifestationId>(
                "00000000-0000-0000-0000-000000000102",
              ),
              eventTitle: "Robotics demo day",
              plan: [],
              notes: [],
            },
          ],
          previous: null,
        }),
    ],
    [
      "find events",
      () =>
        d.agent.scout({
          agent,
          memories,
          request: "Events with African banks",
          budgetCents: 5000,
          candidates: [
            {
              event,
              hosts: [
                {
                  hostId: id<UserId>("00000000-0000-0000-0000-000000000201"),
                  displayName: "Sarah M.",
                  priceCents: 2000,
                  openToRequests: true,
                },
              ],
            },
          ],
        }),
    ],
    [
      "meet an agent",
      () =>
        d.agent.assess({
          agent,
          memories,
          event,
          other: {
            name: "Maya",
            about: "Building speech datasets for Southern African languages.",
          },
        }),
    ],
  ];

  const results = [];
  for (const [name, run] of checks) {
    const t0 = Date.now();
    try {
      const out = await run();
      results.push({
        check: name,
        ok: true,
        ms: Date.now() - t0,
        sample: JSON.stringify(out).slice(0, 600),
      });
    } catch (e) {
      results.push({
        check: name,
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const fake = process.env.PRESENCE_FAKE_AI === "1";
  return Response.json({
    using: fake
      ? "FAKE AI (turn off PRESENCE_FAKE_AI to test the real model)"
      : "real providers",
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

function silentWav(seconds: number): Uint8Array {
  const rate = 16000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  return new Uint8Array(buf);
}
