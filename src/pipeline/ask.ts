import { DomainError, type AgentId, type ManifestationId } from "@/core";
import { loadContext, type Deps } from "./deps";

const RECALL_LIMIT = 30;

/** "What did you learn today?" Answered from the agent's own observations across every manifestation. */
export async function ask(d: Deps, agentId: AgentId, question: string): Promise<{ answer: string; basedOn: number }> {
  const agent = await d.repos.agents.get(agentId);
  if (!agent) throw new DomainError("not_found", `agent ${agentId} not found`);
  const observations = await d.memory.recall(agentId, question, RECALL_LIMIT);

  const ids = [...new Set(observations.map((o) => o.manifestationId))];
  const contexts = await Promise.all(ids.map((id: ManifestationId) => loadContext(d, id)));
  const eventTitles = Object.fromEntries(contexts.map((c) => [c.manifestation.id, c.event.title]));

  const answer = await d.agent.answer({ agent, question, observations, eventTitles });
  return { answer, basedOn: observations.length };
}
