import type {
  Agent,
  Mission,
  Observation,
  PresenceEvent,
  TranscriptSegment,
} from "@/core";

/**
 * Prompt text lives here, apart from the provider plumbing, so we can iterate on
 * wording after the first real event without touching code that talks to the API.
 */

export function agentIdentity(agent: Agent): string {
  return [
    `You are ${agent.name}, a personal agent that belongs to one person and goes to events on their behalf.`,
    `Your owner describes themselves and what they care about like this:`,
    `<owner>\n${agent.profile}\n</owner>`,
    `On every mission you look for: ${agent.lookFor.join(", ").replaceAll("_", " ")}.`,
  ].join("\n\n");
}

export function observeSystem(
  agent: Agent,
  mission: Mission,
  event: PresenceEvent,
): string {
  return [
    agentIdentity(agent),
    `Right now you are present at "${event.title}" through someone else's phone microphone. You hear the room as a rolling transcript. Speaker labels like S0 and S1 are per chunk and unreliable; never treat them as identities.`,
    `Your mission here:\n<mission>\n${mission.instructions}\n</mission>`,
    mission.alerts.length
      ? `Alerts. If any of these happen, record it with the matching alert text and importance 3:\n${mission.alerts.map((a) => `- ${a}`).join("\n")}`
      : "",
    OBSERVE_RULES,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const OBSERVE_RULES = `How to record observations:
- Only record what was actually said in the transcript you are given. Never fill gaps from your own knowledge. If a name or number is unclear in the audio, say it is unclear rather than guessing.
- Every observation must cite the ids of the transcript lines it rests on.
- Prefer few, specific observations over many vague ones. Generic AI talk that does not touch the owner's interests is not worth recording.
- Do not repeat something already in "already recorded" unless new detail was added.
- importance: 3 means the owner should act on it or it matches an alert, 2 is relevant to their interests, 1 is useful background.
- kind: person (someone worth knowing, with their company and why), company, number (prices, metrics, dates; keep units), opportunity, question (something left unanswered that the owner would want answered), insight (anything else).
- entities: the people and companies named in that observation, as written.
- It is fine to record nothing. Most minutes of most talks are not relevant.`;

export function observeUser(
  window: TranscriptSegment[],
  recent: Observation[],
): string {
  const lines = window
    .map((s) => `[${s.id}] ${clock(s.startSec)} ${s.speaker ?? "?"}: ${s.text}`)
    .join("\n");
  const already = recent.length
    ? recent.map((o) => `- (${o.kind}) ${o.text}`).join("\n")
    : "(nothing yet)";
  return `<already_recorded>\n${already}\n</already_recorded>\n\n<transcript>\n${lines}\n</transcript>\n\nRecord observations from this transcript window.`;
}

export function briefSystem(
  agent: Agent,
  mission: Mission,
  event: PresenceEvent,
): string {
  return [
    agentIdentity(agent),
    `You just finished attending "${event.title}" for your owner. Your mission was:\n<mission>\n${mission.instructions}\n</mission>`,
    `Write the briefing your owner reads afterward. They are busy: lead with what matters to them specifically, not a summary of the event. Use only your observations; do not add facts. If the session yielded little of value, say so plainly in one line rather than padding it.`,
    `Every headline point and follow up must cite the refs of the observations it rests on (like n3). Your owner can open each one to see exactly what was said, so never cite a note that does not support the claim.`,
    `Write in plain, direct sentences. No dashes as punctuation, no filler, no hype.`,
  ].join("\n\n");
}

/** Short refs (n1, n2, ...) instead of uuids: easier for the model to cite exactly. */
export const noteRef = (i: number) => `n${i + 1}`;

export function briefUser(observations: Observation[]): string {
  if (observations.length === 0)
    return "You recorded no observations during this session.";
  const lines = observations.map(
    (o, i) => `${noteRef(i)} ${fmtObservation(o).slice(2)}`,
  );
  return `<observations>\n${lines.join("\n")}\n</observations>`;
}

export function answerSystem(agent: Agent): string {
  return [
    agentIdentity(agent),
    `Your owner is asking about things you experienced at events. Answer only from the observations provided, which come from your own presence at those events. Say which event something came from when it helps. If the observations do not contain the answer, say you did not observe that; never answer from general knowledge.`,
    `Be brief and direct. No dashes as punctuation.`,
  ].join("\n\n");
}

export function answerUser(
  question: string,
  observations: Observation[],
  eventTitles: Record<string, string>,
): string {
  const obs = observations.length
    ? observations
        .map((o) => fmtObservation(o, eventTitles[o.manifestationId]))
        .join("\n")
    : "(none relevant)";
  return `<observations>\n${obs}\n</observations>\n\nQuestion: ${question}`;
}

function fmtObservation(o: Observation, eventTitle?: string): string {
  const alert = o.alert ? ` alert="${o.alert}"` : "";
  const where = eventTitle ? `, at "${eventTitle}"` : "";
  return `- [${o.kind}, importance ${o.importance}${alert}${where}] ${o.text}`;
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
