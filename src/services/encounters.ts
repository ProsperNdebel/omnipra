import {
  answerEncounter,
  DomainError,
  sideOf,
  type Agent,
  type EncounterId,
  type UserId,
} from "@/core";
import type { Deps } from "@/pipeline";
import { ownedAgent } from "./agents";

/** One encounter as one owner sees it: only their own agent's read, and contact only once both agreed. */
export interface EncounterView {
  id: string;
  eventTitle: string;
  metName: string;
  metAbout: string;
  why: string;
  /** Whether the other person's agent asked for this introduction. */
  theyAsked: boolean;
  myAnswer: "pending" | "yes" | "no";
  status: "open" | "introduced" | "declined";
  /** The other owner's contact, once both said yes. */
  contact: string | null;
}

/**
 * Who the agent met. Shown when its own agent thought it worthwhile or the other side
 * asked to be introduced. Declined ones disappear without saying who declined.
 */
export async function agentEncounters(
  d: Deps,
  agent: Agent,
): Promise<EncounterView[]> {
  const all = await d.repos.encounters.byAgent(agent.id);
  const views: EncounterView[] = [];
  for (const e of all) {
    if (e.status === "declined") continue;
    const i = sideOf(e, agent.id);
    const me = e.sides[i];
    const them = e.sides[i === 0 ? 1 : 0];
    if (!me.relevant && them.answer !== "yes") continue;
    let contact: string | null = null;
    if (e.status === "introduced") {
      const other = await d.repos.agents.get(them.agentId);
      contact = other?.card?.contact || null;
    }
    views.push({
      id: e.id,
      eventTitle: e.eventTitle,
      metName: me.metName,
      metAbout: me.metAbout,
      why: me.why,
      theyAsked: them.answer === "yes",
      myAnswer: me.answer,
      status: e.status,
      contact,
    });
  }
  return views;
}

export async function answerIntroduction(
  d: Deps,
  ownerId: UserId,
  agentId: string,
  encounterId: string,
  answer: "yes" | "no",
) {
  const agent = await ownedAgent(d, ownerId, agentId);
  const e = await d.repos.encounters.get(encounterId as EncounterId);
  if (!e) throw new DomainError("not_found", "That introduction is gone.");
  await d.repos.encounters.save(answerEncounter(e, agent.id, answer, d.now()));
}
