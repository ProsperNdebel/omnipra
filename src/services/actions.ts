import {
  cleanPayload,
  decideAction,
  DomainError,
  type Action,
  type ActionId,
  type Agent,
  type Execution,
  type UserId,
} from "@/core";
import { withTitles, type Deps } from "@/pipeline";
import { ownedAgent } from "./agents";
import type { SuggestionSource } from "./suggestions";

export interface ActionView extends Action {
  sources: SuggestionSource[];
  /** Ways to carry it out, in order. */
  executors: { id: string; label: string }[];
}

const RECENT_DONE = 8;

/** Everything the agent has prepared, is tracking, or has done, for its owner's page. */
export async function agentActions(
  d: Deps,
  agent: Agent,
): Promise<{ proposed: ActionView[]; todo: ActionView[]; done: ActionView[] }> {
  const all = await d.repos.actions.byAgent(agent.id);
  const proposed = all.filter((a) => a.status === "proposed");
  const todo = all.filter((a) => a.status === "active");
  const done = all.filter((a) => a.status === "done").slice(0, RECENT_DONE);
  const shown = [...proposed, ...todo, ...done];
  const notes = await withTitles(
    d,
    await d.repos.observations.byIds([
      ...new Set(shown.flatMap((a) => a.evidence)),
    ]),
  );
  const byId = new Map(notes.map((n) => [n.note.id, n]));
  const view = (a: Action): ActionView => ({
    ...a,
    sources: a.evidence.flatMap((id) => {
      const n = byId.get(id);
      return n
        ? [
            {
              noteId: id,
              sessionId: n.note.manifestationId,
              eventTitle: n.eventTitle,
              atSec: n.note.atSec,
            },
          ]
        : [];
    }),
    executors: d.executors
      .filter((e) => e.handles(a.payload.kind))
      .map(({ id, label }) => ({ id, label })),
  });
  return {
    proposed: proposed.map(view),
    todo: todo.map(view),
    done: done.map(view),
  };
}

async function owned(d: Deps, ownerId: UserId, id: string): Promise<Action> {
  const a = await d.repos.actions.get(id as ActionId);
  if (!a) throw new DomainError("not_found", "That action is gone.");
  await ownedAgent(d, ownerId, a.agentId);
  return a;
}

/** The owner corrects what the agent prepared before it goes. */
export async function editAction(
  d: Deps,
  ownerId: UserId,
  id: string,
  fields: Record<string, unknown>,
): Promise<Action> {
  const a = await owned(d, ownerId, id);
  if (a.status !== "proposed")
    throw new DomainError(
      "bad_request",
      "Only something not yet done can be edited.",
    );
  const next = {
    ...a,
    payload: cleanPayload(a.payload.kind, { ...a.payload, ...fields }),
  };
  await d.repos.actions.save([next]);
  return next;
}

/** Approve (a to do goes on the list), tick off a to do, or dismiss. */
export async function decideOnAction(
  d: Deps,
  ownerId: UserId,
  id: string,
  op: "approve" | "complete" | "dismiss",
): Promise<Action> {
  const a = await owned(d, ownerId, id);
  const next = decideAction(
    a,
    op,
    d.now(),
    op === "complete" ? "marked done" : null,
  );
  await d.repos.actions.save([next]);
  return next;
}

/**
 * Carry out an approved action with one executor. The owner pressing the button is
 * the approval. Returns what the browser needs to finish (a link, a file, text to copy),
 * and records how it was done so the agent remembers.
 */
export async function runAction(
  d: Deps,
  ownerId: UserId,
  id: string,
  executorId: string,
): Promise<Execution> {
  const a = await owned(d, ownerId, id);
  const ex = d.executors.find(
    (e) => e.id === executorId && e.handles(a.payload.kind),
  );
  if (!ex) throw new DomainError("bad_request", "That can't be done this way.");
  if (a.status !== "proposed" && a.status !== "done")
    throw new DomainError("bad_request", `That is ${a.status}.`);
  const result = await ex.run(a);
  // Running it again (copying twice, re-downloading) is fine; only the first marks it done.
  if (a.status === "proposed")
    await d.repos.actions.save([
      decideAction(a, "complete", d.now(), result.how),
    ]);
  return result;
}
