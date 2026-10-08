"use server";

import { redirect } from "next/navigation";
import {
  DomainError,
  type CapturePolicy,
  type EventId,
  type ManifestationId,
  type UserId,
} from "@/core";
import { applyTransition } from "@/pipeline";
import {
  addMemory,
  attend,
  authorizeTransition,
  createAgent,
  createEvent,
  sendAgent,
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
