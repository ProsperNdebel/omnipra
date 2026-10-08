import {
  DomainError,
  type AgentId,
  type AskTurn,
  type AskTurnId,
} from "@/core";
import type { Deps } from "./deps";
import { proposeLearned, recallMemory } from "./memory";

const RECALL_LIMIT = 30;
/** How much of the conversation the agent rereads before answering. */
const HISTORY_TURNS = 10;

/**
 * "What did you learn today?" Answered from the agent's own observations across every
 * session, as one running conversation: earlier turns are passed back so follow ups make
 * sense, and the last turn widens recall so "the second one" still finds its notes.
 */
export async function ask(
  d: Deps,
  agentId: AgentId,
  question: string,
): Promise<AskTurn & { learned: string[] }> {
  const agent = await d.repos.agents.get(agentId);
  if (!agent) throw new DomainError("not_found", `agent ${agentId} not found`);

  const history = await d.repos.askTurns.recent(agentId, HISTORY_TURNS);
  const last = history.at(-1);
  const query = last ? `${question} ${last.question} ${last.answer}` : question;
  const [observations, memories] = await Promise.all([
    d.memory.recall(agentId, query, RECALL_LIMIT),
    recallMemory(d, agentId, query),
  ]);

  const ids = [...new Set(observations.map((o) => o.manifestationId))];
  const contexts = await d.repos.manifestations.contexts({ ids });
  const eventTitles = Object.fromEntries(
    contexts.map((c) => [c.manifestation.id, c.event.title]),
  );

  const { answer, learn } = await d.agent.answer({
    agent,
    memories,
    question,
    observations,
    eventTitles,
    history: history.map(({ question, answer }) => ({ question, answer })),
  });

  const turn: AskTurn = {
    id: d.newId() as AskTurnId,
    agentId,
    question,
    answer,
    basedOn: observations.length,
    createdAt: d.now(),
  };
  await d.repos.askTurns.append(turn);
  const learned = await proposeLearned(d, agentId, learn, {
    manifestationId: null,
    quote: question,
  });
  return { ...turn, learned: learned.map((m) => m.text) };
}

/** The conversation so far, oldest first, for showing on the agent page. */
export const askHistory = (d: Deps, agentId: AgentId) =>
  d.repos.askTurns.recent(agentId, 50);

/** Start over: the agent forgets the conversation, not what it observed. */
export const clearAsks = (d: Deps, agentId: AgentId) =>
  d.repos.askTurns.clear(agentId);
