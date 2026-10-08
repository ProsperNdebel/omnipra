"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import {
  DomainError,
  type CapturePolicy,
  type EventId,
  type ManifestationId,
  type UserId,
} from "@/core";
import { applyTransition, draftPlan } from "@/pipeline";
import {
  actOnSuggestion,
  decideOnAction,
  editAction,
  addMemory,
  attend,
  authorizeTransition,
  createAgent,
  createEvent,
  sendAgent,
  editPlan,
  replan,
  reviewMemory,
  updateAgent,
  type MemoryReview,
} from "@/services";
import { getDeps } from "@/server/deps";
import { viewerId } from "@/server/viewer";
import { localInputToIso } from "@/ui/format";

/**
 * Form handlers. Each one parses FormData, calls one service, and redirects.
 * Domain errors go back to the form as ?error= so the page can say what to fix.
 */

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function fail(path: string, err: unknown): never {
  if (err instanceof DomainError)
    redirect(
      `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(err.message)}`,
    );
  throw err;
}

/** Only allow redirects to our own paths. */
const safeNext = (v: string) =>
  v.startsWith("/") && !v.startsWith("//") ? v : "/agent";

export async function createEventAction(form: FormData) {
  let id: EventId;
  try {
    const event = await createEvent(getDeps(), {
      title: str(form, "title"),
      startsAt: localInputToIso(str(form, "startsAt")),
      endsAt: localInputToIso(str(form, "endsAt")),
      venue: str(form, "venue") || null,
      sourceUrl: str(form, "sourceUrl") || null,
      capturePolicy: str(form, "capturePolicy") as CapturePolicy,
    });
    id = event.id;
  } catch (err) {
    fail("/events/new", err);
  }
  redirect(`/events/${id}`);
}

export async function attendAction(form: FormData) {
  const eventId = str(form, "eventId") as EventId;
  try {
    await attend(getDeps(), {
      eventId,
      hostId: await viewerId(),
      displayName: str(form, "displayName"),
      priceCents: Math.round(Number(str(form, "price")) * 100),
      openToRequests: form.get("openToRequests") === "on",
    });
  } catch (err) {
    fail(`/events/${eventId}`, err);
  }
  redirect(`/events/${eventId}?listed=1`);
}

export async function createAgentAction(form: FormData) {
  // Coming from "send" returns there; otherwise land on the new agent's page.
  const next = str(form, "next") ? safeNext(str(form, "next")) : null;
  let id: string;
  try {
    const agent = await createAgent(getDeps(), await viewerId(), {
      name: str(form, "name"),
      profile: str(form, "profile"),
      style: str(form, "style"),
      lookFor: form.getAll("lookFor").map(String),
    });
    id = agent.id;
  } catch (err) {
    fail(`/agent/new${next ? `?next=${encodeURIComponent(next)}` : ""}`, err);
  }
  redirect(next ?? `/agent/${id}`);
}

export async function updateAgentAction(form: FormData) {
  const id = str(form, "id");
  try {
    await updateAgent(getDeps(), await viewerId(), id, {
      name: str(form, "name"),
      profile: str(form, "profile"),
      style: str(form, "style"),
      lookFor: form.getAll("lookFor").map(String),
    });
  } catch (err) {
    fail(`/agent/${id}/edit`, err);
  }
  redirect(`/agent/${id}?saved=1`);
}

export async function sendAgentAction(form: FormData) {
  const eventId = str(form, "eventId") as EventId;
  const hostId = str(form, "hostId") as UserId;
  let id: ManifestationId;
  try {
    const m = await sendAgent(getDeps(), {
      ownerId: await viewerId(),
      agentId: str(form, "agentId"),
      eventId,
      hostId,
      instructions: str(form, "instructions"),
      alerts: str(form, "alerts").split("\n"),
      autonomy: str(form, "autonomy") === "act" ? "act" : "ask_first",
    });
    id = m.id;
    // The plan drafts while the owner lands on the session page; it shows when ready.
    const missionId = m.missionId;
    after(() =>
      draftPlan(getDeps(), missionId).catch((e) =>
        console.error("plan failed", e),
      ),
    );
  } catch (err) {
    fail(`/send/${eventId}/${hostId}`, err);
  }
  redirect(`/m/${id}`);
}

/** accept, decline (host) and cancel (owner). Start and end happen on the session screen. */
export async function decideAction(form: FormData) {
  const id = str(form, "id") as ManifestationId;
  const decision = str(form, "decision");
  if (decision !== "accept" && decision !== "decline" && decision !== "cancel")
    throw new Error("bad decision");
  const back = decision === "cancel" ? `/m/${id}` : "/host";
  try {
    const d = getDeps();
    await authorizeTransition(d, id, await viewerId(), decision);
    await applyTransition(d, id, decision);
  } catch (err) {
    fail(back, err);
  }
  redirect(decision === "accept" ? `/host/${id}` : back);
}

/** The owner tells their agent something to remember. */
export async function addMemoryAction(form: FormData) {
  const agentId = str(form, "agentId");
  try {
    await addMemory(getDeps(), await viewerId(), agentId, {
      kind: str(form, "kind"),
      text: str(form, "text"),
    });
  } catch (err) {
    fail(`/agent/${agentId}`, err);
  }
  redirect(`/agent/${agentId}#memory`);
}

const REVIEWS: MemoryReview[] = ["keep", "edit", "forget"];

/** Keep, correct or forget one memory. The button pressed is carried in a hidden field. */
export async function reviewMemoryAction(form: FormData) {
  const agentId = str(form, "agentId");
  const op = REVIEWS.find((r) => r === str(form, "op"));
  try {
    if (!op) throw new DomainError("bad_request", "Unknown change.");
    await reviewMemory(
      getDeps(),
      await viewerId(),
      str(form, "id"),
      op,
      str(form, "text"),
    );
  } catch (err) {
    fail(`/agent/${agentId}`, err);
  }
  redirect(`/agent/${agentId}#memory`);
}

/** Draft or redraft the agent's plan for a session. */
export async function replanAction(form: FormData) {
  const id = str(form, "manifestationId");
  try {
    await replan(getDeps(), await viewerId(), id);
  } catch (err) {
    fail(`/m/${id}`, err);
  }
  redirect(`/m/${id}#plan`);
}

/** The owner's edits to the plan: one field per item (blank removes it), plus one new line. */
export async function editPlanAction(form: FormData) {
  const id = str(form, "manifestationId");
  try {
    await editPlan(getDeps(), await viewerId(), id, {
      items: form
        .getAll("itemId")
        .map(String)
        .map((itemId) => ({
          id: itemId,
          watchFor: str(form, `item:${itemId}`),
        })),
      added: str(form, "added"),
    });
  } catch (err) {
    fail(`/m/${id}`, err);
  }
  redirect(`/m/${id}#plan`);
}

/** Take the agent up on a suggestion (draft it, or watch for it), or dismiss it. */
export async function suggestionAction(form: FormData) {
  const agentId = str(form, "agentId");
  const op = str(form, "op") === "accept" ? "accept" : "dismiss";
  try {
    await actOnSuggestion(getDeps(), await viewerId(), str(form, "id"), op);
  } catch (err) {
    fail(`/agent/${agentId}`, err);
  }
  redirect(`/agent/${agentId}#next`);
}

/** Approve a to do, tick one off, or dismiss what the agent prepared. */
export async function decideActionAction(form: FormData) {
  const agentId = str(form, "agentId");
  const op = str(form, "op");
  try {
    if (op !== "approve" && op !== "complete" && op !== "dismiss")
      throw new DomainError("bad_request", "Unknown choice.");
    await decideOnAction(getDeps(), await viewerId(), str(form, "id"), op);
  } catch (err) {
    fail(`/agent/${agentId}`, err);
  }
  redirect(`/agent/${agentId}#actions`);
}

/** The owner's corrections to a prepared action. Every field present in the form is applied. */
export async function editActionAction(form: FormData) {
  const agentId = str(form, "agentId");
  const fields: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("f:")) continue;
    const value = String(v);
    // Times come from datetime-local inputs, in the event time zone.
    fields[k.slice(2)] = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
      ? localInputToIso(value)
      : value;
  }
  try {
    await editAction(getDeps(), await viewerId(), str(form, "id"), fields);
  } catch (err) {
    fail(`/agent/${agentId}`, err);
  }
  redirect(`/agent/${agentId}#actions`);
}
