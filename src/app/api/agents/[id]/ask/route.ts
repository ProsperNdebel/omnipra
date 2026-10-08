import { DomainError, type AgentId } from "@/core";
import { ask, clearAsks, type Deps } from "@/pipeline";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

async function own(d: Deps, id: string) {
  const agent = await d.repos.agents.get(id as AgentId);
  if (!agent || agent.ownerId !== (await viewerId()))
    throw new DomainError("forbidden", "Not your agent.");
  return agent;
}

/** POST { question } → the saved turn: the agent's answer from its own observations, in context of the conversation so far. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as {
      question?: unknown;
    } | null;
    const question =
      typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) badRequest("question is required");

    const d = getDeps();
    const agent = await own(d, id);
    return Response.json(await ask(d, agent.id, question.slice(0, 500)));
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE → start the conversation over. Observations are untouched. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const d = getDeps();
    const agent = await own(d, id);
    await clearAsks(d, agent.id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
