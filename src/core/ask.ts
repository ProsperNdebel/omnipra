import type { AgentId, AskTurnId, ISODate } from "./ids";

/**
 * One exchange in the owner's running conversation with their agent about what it
 * experienced. Kept so follow ups ("what about the second one?") have something to refer to.
 */
export interface AskTurn {
  id: AskTurnId;
  agentId: AgentId;
  question: string;
  answer: string;
  /** How many notes the answer was drawn from. */
  basedOn: number;
  createdAt: ISODate;
}
