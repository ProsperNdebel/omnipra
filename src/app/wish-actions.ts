"use server";

import { redirect } from "next/navigation";
import { DomainError, type EventId } from "@/core";
import { cancelWish, requestAgent, takeWish } from "@/services";
import { getDeps } from "@/server/deps";
import { queue } from "@/server/jobs";
import { viewerId } from "@/server/viewer";

/** Open requests: asking for a host at an event, withdrawing, and a host taking one. */

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function fail(path: string, err: unknown): never {
  if (err instanceof DomainError)
    redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(err.message)}`);
  throw err;
}

export async function requestAgentAction(form: FormData) {
  const eventId = str(form, "eventId") as EventId;
  try {
    await requestAgent(getDeps(), {
      ownerId: await viewerId(),
      agentId: str(form, "agentId"),
      eventId,
      instructions: str(form, "instructions"),
      alerts: str(form, "alerts").split("\n"),
      autonomy: str(form, "autonomy") === "act" ? "act" : "ask_first",
      maxPriceCents: Math.round(Number(str(form, "maxPrice")) * 100),
    });
  } catch (err) {
    fail(`/request/${eventId}`, err);
  }
  redirect(`/events/${eventId}?requested=1`);
}

export async function cancelWishAction(form: FormData) {
  const back = str(form, "back") || "/agent";
  try {
    await cancelWish(getDeps(), await viewerId(), str(form, "id"));
  } catch (err) {
    fail(back, err);
  }
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/agent");
}

export async function takeWishAction(form: FormData) {
  const back = str(form, "back") || "/host";
  let id: string;
  try {
    const { manifestation } = await takeWish(getDeps(), await viewerId(), str(form, "id"));
    id = manifestation.id;
    // Same as a direct booking: the agent drafts its plan in the background.
    await queue(getDeps(), "plan", { missionId: manifestation.missionId });
  } catch (err) {
    fail(back, err);
  }
  redirect(`/host/${id}`);
}
