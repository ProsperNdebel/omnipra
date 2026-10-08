import {
  describeAction,
  type Action,
  type ActionId,
  type ActionOrigin,
  type ActRequest,
  type AgentId,
  type ObservationId,
} from "@/core";
import type { Deps } from "./deps";
import { recallMemory } from "./memory";
import { withTitles } from "./notes";

/** How much of its own track record the agent rereads. */
const RECENT_ACTIONS = 10;
/** Notes pulled in when an action came from words rather than a suggestion. */
const NOTES_FOR_ACTION = 8;
/** One request never fans out into a pile of actions. */
const MAX_AT_ONCE = 2;

/** What the agent has done or prepared lately, dismissed ones aside. Newest first. */
export async function recentActions(d: Deps, agentId: AgentId) {
  return (await d.repos.actions.byAgent(agentId))
    .filter((a) => a.status !== "dismissed")
    .slice(0, RECENT_ACTIONS);
}

/**
 * Prepare actions for the owner to approve. Nothing happens in the world here: the
 * agent fills in the details from the notes behind it, and the owner decides.
 */
export async function prepareActions(
  d: Deps,
  agentId: AgentId,
  requests: ActRequest[],
  origin: ActionOrigin,
  evidence: ObservationId[] = [],
): Promise<Action[]> {
  if (requests.length === 0) return [];
  const agent = await d.repos.agents.get(agentId);
  if (!agent) throw new Error("agent not found");

  const prepared: Action[] = [];
  for (const req of requests.slice(0, MAX_AT_ONCE)) {
    const query = `${req.instruction} ${req.target ?? ""}`;
    const [memories, recent, found] = await Promise.all([
      recallMemory(d, agentId, query),
      recentActions(d, agentId),
      evidence.length
        ? d.repos.observations.byIds(evidence)
        : d.memory.recall(agentId, query, NOTES_FOR_ACTION),
    ]);
    const notes = await withTitles(d, found);
    const { payload, why } = await d.agent.prepare({
      ...req,
      agent,
      memories,
      notes,
      recentActions: recent,
    });
    prepared.push({
      id: d.newId() as ActionId,
      agentId,
      payload,
      why,
      evidence: notes.map((n) => n.note.id),
      origin,
      status: "proposed",
      how: null,
      createdAt: d.now(),
      doneAt: null,
    });
  }
  await d.repos.actions.save(prepared);
  return prepared;
}

export { describeAction };
