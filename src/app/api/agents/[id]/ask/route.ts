import { DomainError, type AgentId } from "@/core";
import { ask } from "@/pipeline";
import { getDeps } from "@/server/deps";
import { badRequest, errorResponse } from "@/server/http";
import { viewerId } from "@/server/viewer";

export const runtime = "nodejs";

/** POST { question } → the agent's answer, from its own observations across every manifestation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) badRequest("question is required");

    const d = getDeps();
    const agent = await d.repos.agents.get(id as AgentId);
    if (!agent || agent.ownerId !== (await viewerId())) throw new DomainError("forbidden", "Not your agent.");

    return Response.json(await ask(d, agent.id, question));
  } catch (err) {
    return errorResponse(err);
  }
}
