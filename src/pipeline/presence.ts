import {
  type Observation,
  type ObservationId,
  describeAction,
  DomainError,
  REQUEST_ROLE,
  transitionRequest,
  type AgentMessage,
  type Autonomy,
  type HostRequest,
  type HostRequestEvent,
  type HostRequestId,
  type MessageId,
  type NewAsk,
  type PresenceInput,
  type RelatedNote,
} from "@/core";
import type { Deps, ManifestationContext } from "./deps";
import { prepareActions, recentActions } from "./act";
import { proposeLearned, recallMemory } from "./memory";

/** How much of the session the agent sees each time it thinks. */
const RECENT_NOTES = 20;
const RECENT_MESSAGES = 20;
/** Notes from elsewhere it gets: memory hits and the latest from each other live room. */
const RELATED_FROM_MEMORY = 6;
const RELATED_PER_LIVE_ROOM = 3;

/**
 * Everything the agent knows about where it is right now: this session's notes and
 * conversation, open asks, whether the host takes requests, and what it heard elsewhere.
 * `query` steers memory recall (the transcript window, or the owner's message).
 */
export async function presenceInput(
  d: Deps,
  ctx: ManifestationContext,
  query: string,
): Promise<PresenceInput> {
  const id = ctx.manifestation.id;
  const [notes, messages, requests, listings, related, memories, done] =
    await Promise.all([
      d.repos.observations.byManifestation(id),
      d.repos.messages.byManifestation(id),
      d.repos.hostRequests.byManifestation(id),
      d.repos.events.listingsFor([ctx.event.id]),
      relatedNotes(d, ctx, query),
      recallMemory(d, ctx.agent.id, query),
      recentActions(d, ctx.agent.id),
    ]);
  const listing = listings.find((l) => l.hostId === ctx.endpoint.hostId);
  return {
    agent: ctx.agent,
    memories,
    recentActions: done,
    mission: ctx.mission,
    event: ctx.event,
    recent: notes.slice(-RECENT_NOTES),
    conversation: messages.slice(-RECENT_MESSAGES),
    requests: requests.filter(
      (r) =>
        r.status === "proposed" ||
        r.status === "sent" ||
        r.status === "accepted" ||
        r.status === "done",
    ),
    hostTakesRequests: listing?.openToRequests ?? false,
    related,
  };
}

/**
 * One agent, many rooms: what its memory says about this moment, plus the latest from
 * every other room it is in right now. This is what lets it connect across events.
 */
async function relatedNotes(
  d: Deps,
  ctx: ManifestationContext,
  query: string,
): Promise<RelatedNote[]> {
  const others = (
    await d.repos.manifestations.contexts({
      agentIds: [ctx.agent.id],
      status: "live",
    })
  ).filter((c) => c.manifestation.id !== ctx.manifestation.id);

  const [remembered, liveNotes] = await Promise.all([
    query.trim()
      ? d.memory.recall(ctx.agent.id, query, RELATED_FROM_MEMORY + RECENT_NOTES)
      : Promise.resolve([]),
    d.repos.observations.byManifestations(
      others.map((c) => c.manifestation.id),
    ),
  ]);

  const liveIds = new Set(others.map((c) => c.manifestation.id as string));
  const titleOf = new Map<string, string>(
    others.map((c) => [c.manifestation.id, c.event.title]),
  );
  const fromLive: RelatedNote[] = others.flatMap((c) =>
    liveNotes
      .filter((o) => o.manifestationId === c.manifestation.id)
      .slice(-RELATED_PER_LIVE_ROOM)
      .map((o) => ({ text: o.text, eventTitle: c.event.title, live: true })),
  );

  // Memory hits from past sessions; skip this room (already in context) and live rooms (above).
  const pastIds = remembered
    .map((o) => o.manifestationId)
    .filter((m) => m !== ctx.manifestation.id && !liveIds.has(m));
  const past = pastIds.length
    ? await d.repos.manifestations.contexts({ ids: [...new Set(pastIds)] })
    : [];
  for (const c of past) titleOf.set(c.manifestation.id, c.event.title);
  const fromMemory: RelatedNote[] = remembered
    .filter((o) => pastIds.includes(o.manifestationId))
    .slice(0, RELATED_FROM_MEMORY)
    .map((o) => ({
      text: o.text,
      eventTitle: titleOf.get(o.manifestationId) ?? "an earlier event",
      live: false,
    }));

  return [...fromLive, ...fromMemory];
}

export function message(
  d: Deps,
  ctx: ManifestationContext,
  m: Pick<AgentMessage, "from" | "kind" | "text"> & { atSec?: number | null },
): AgentMessage {
  return {
    id: d.newId() as MessageId,
    manifestationId: ctx.manifestation.id,
    agentId: ctx.agent.id,
    from: m.from,
    kind: m.kind,
    text: m.text,
    atSec: m.atSec ?? null,
    createdAt: d.now(),
  };
}

const same = (a: string, b: string) =>
  a.toLowerCase().replace(/\W+/g, " ").trim() ===
  b.toLowerCase().replace(/\W+/g, " ").trim();

/**
 * File new asks for the host. They go straight to the host only when the host takes
 * requests and either the owner asked for it or the session is set to act; otherwise
 * they wait for the owner. Duplicates of existing asks are skipped.
 */
export async function fileAsks(
  d: Deps,
  ctx: ManifestationContext,
  asks: NewAsk[],
  opts: { origin: "agent" | "owner"; hostTakesRequests: boolean },
): Promise<{ requests: HostRequest[]; messages: AgentMessage[] }> {
  if (!opts.hostTakesRequests || asks.length === 0) {
    return { requests: [], messages: [] };
  }
  const existing = await d.repos.hostRequests.byManifestation(
    ctx.manifestation.id,
  );
  const sendNow = opts.origin === "owner" || ctx.mission.autonomy === "act";
  const now = d.now();

  const requests: HostRequest[] = [];
  for (const a of asks) {
    if ([...existing, ...requests].some((r) => same(r.ask, a.ask))) continue;
    requests.push({
      id: d.newId() as HostRequestId,
      manifestationId: ctx.manifestation.id,
      agentId: ctx.agent.id,
      ask: a.ask,
      why: a.why,
      origin: opts.origin,
      status: sendNow ? "sent" : "proposed",
      hostNote: null,
      createdAt: now,
      sentAt: sendNow ? now : null,
      resolvedAt: null,
    });
  }
  for (const r of requests) await d.repos.hostRequests.save(r, null);

  const messages = requests.map((r) =>
    message(d, ctx, {
      from: "agent",
      kind: "update",
      text:
        r.status === "sent"
          ? `Asked the host: ${r.ask}`
          : `I'd like to ask the host: ${r.ask}${r.why ? ` (${r.why})` : ""}`,
    }),
  );
  await d.repos.messages.append(messages);
  return { requests, messages };
}

/** Sessions you can talk to or act in. */
const ACTIVE = new Set(["accepted", "live"]);

/**
 * The owner talks to their agent mid-session. It replies, may take on new standing
 * orders, may file asks for the host, and may approve its own proposals on their word.
 */
export async function converse(
  d: Deps,
  ctx: ManifestationContext,
  text: string,
): Promise<AgentMessage[]> {
  const said = text.trim();
  if (!said)
    throw new DomainError("bad_request", "Say something to your agent.");
  if (said.length > 1000)
    throw new DomainError("bad_request", "Keep it under 1000 characters.");
  if (!ACTIVE.has(ctx.manifestation.status)) {
    throw new DomainError(
      "bad_request",
      `${ctx.agent.name} isn't at this event anymore.`,
    );
  }

  const mine = message(d, ctx, { from: "owner", kind: "chat", text: said });
  await d.repos.messages.append([mine]);

  const input = await presenceInput(d, ctx, said);
  const out = await d.agent.converse({ ...input, message: said });
  const added: AgentMessage[] = [mine];

  if (out.addOrders.length) {
    const mission = {
      ...ctx.mission,
      orders: [...ctx.mission.orders, ...out.addOrders],
    };
    await d.repos.missions.save(mission);
    ctx = { ...ctx, mission };
  }

  // Approvals in words ("yes, ask them") send the agent's own proposals.
  for (const id of out.approve) {
    const r = input.requests.find((x) => x.id === id);
    if (!r) continue;
    const sent = transitionRequest(r, "send", d.now());
    if (await d.repos.hostRequests.save(sent, r.status)) {
      added.push(
        message(d, ctx, {
          from: "agent",
          kind: "update",
          text: `Asked the host: ${sent.ask}`,
        }),
      );
    }
  }

  const reply = message(d, ctx, {
    from: "agent",
    kind: "chat",
    text: out.reply || "Got it.",
  });
  const toSave = added.slice(1).concat(reply);
  await d.repos.messages.append(toSave);

  const learned = await proposeLearned(d, ctx.agent.id, out.learn, {
    manifestationId: ctx.manifestation.id,
    quote: said,
  });
  if (learned.length) {
    await d.repos.messages.append(
      learned.map((m) =>
        message(d, ctx, {
          from: "agent",
          kind: "update",
          text: `I'd like to remember: ${sentence(m.text)} Keep or correct it on my page.`,
        }),
      ),
    );
  }

  const prepared = await prepareActions(d, ctx.agent.id, out.act, {
    type: "owner",
    quote: said,
    manifestationId: ctx.manifestation.id,
  });
  if (prepared.length) {
    await d.repos.messages.append(
      prepared.map((a) =>
        message(d, ctx, {
          from: "agent",
          kind: "update",
          text: `Ready for you to review on my page: ${sentence(describeAction(a.payload))}`,
        }),
      ),
    );
  }

  const filed = await fileAsks(d, ctx, out.asks, {
    origin: "owner",
    hostTakesRequests: input.hostTakesRequests,
  });
  return [...added, reply, ...filed.messages];
}

/**
 * Move a request: the owner sends (optionally edited) or dismisses; the host marks it
 * done or not possible, optionally with a note. Each step leaves a line in the conversation.
 */
export async function actOnRequest(
  d: Deps,
  ctx: ManifestationContext,
  request: HostRequest,
  viewer: { isOwner: boolean; isHost: boolean },
  event: HostRequestEvent,
  input: { ask?: string; hostNote?: string } = {},
): Promise<HostRequest> {
  const role = REQUEST_ROLE[event];
  if (
    (role === "owner" && !viewer.isOwner) ||
    (role === "host" && !viewer.isHost)
  ) {
    throw new DomainError("forbidden", `You can't ${event} this request.`);
  }
  const listing = (await d.repos.events.listingsFor([ctx.event.id])).find(
    (l) => l.hostId === ctx.endpoint.hostId,
  );
  if (event === "send") {
    const open = listing?.openToRequests;
    if (!open)
      throw new DomainError("bad_request", "This host isn't taking requests.");
  }
  if (!ACTIVE.has(ctx.manifestation.status)) {
    throw new DomainError("bad_request", "This session has ended.");
  }

  const next = transitionRequest(request, event, d.now(), input);
  if (!(await d.repos.hostRequests.save(next, request.status))) {
    throw new DomainError(
      "conflict",
      "That request just changed. Refresh and try again.",
    );
  }

  const note = next.hostNote ? ` They said: "${next.hostNote}"` : "";
  const line =
    event === "send"
      ? message(d, ctx, {
          from: "agent",
          kind: "update",
          text: `Asked the host: ${next.ask}`,
        })
      : event === "dismiss"
        ? message(d, ctx, {
            from: "owner",
            kind: "update",
            text: `Dropped: ${next.ask}`,
          })
        : event === "accept"
          ? message(d, ctx, {
              from: "host",
              kind: "update",
              text: `Host is on it: ${sentence(next.ask)}`,
            })
          : event === "done"
            ? message(d, ctx, {
                from: "host",
                kind: "update",
                text: `Host did it: ${sentence(next.ask)}${note}`,
              })
            : message(d, ctx, {
                from: "host",
                kind: "update",
                text: `Host couldn't: ${sentence(next.ask)}${note}`,
              });
  await d.repos.messages.append([line]);

  // What the host found out is something the agent learned in the room: it becomes
  // a note like any other, recalled in briefings, Ask and later events.
  if (event === "done" && next.hostNote) {
    const host = listing?.displayName.trim();
    const started = ctx.manifestation.startedAt;
    const note: Observation = {
      id: d.newId() as ObservationId,
      agentId: ctx.agent.id,
      manifestationId: ctx.manifestation.id,
      kind: "insight",
      text: `Asked: ${sentence(next.ask)} Answer: ${sentence(next.hostNote)}`,
      importance: 2,
      alert: null,
      basis: "claim",
      speaker: host ? `${host}, your host` : "your host",
      hostRequestId: next.id,
      planItem: null,
      entities: [],
      evidence: [],
      frames: [],
      atSec: started
        ? Math.max(0, (Date.parse(d.now()) - Date.parse(started)) / 1000)
        : null,
      createdAt: d.now(),
    };
    await d.repos.observations.append([note]);
    await d.memory.index([note]);
  }
  return next;
}

/** Change how much the agent may do on its own in this session. */
export async function setAutonomy(
  d: Deps,
  ctx: ManifestationContext,
  autonomy: Autonomy,
): Promise<void> {
  if (ctx.mission.autonomy === autonomy) return;
  await d.repos.missions.save({ ...ctx.mission, autonomy });
  await d.repos.messages.append([
    message(d, ctx, {
      from: "owner",
      kind: "update",
      text:
        autonomy === "act"
          ? `${ctx.agent.name} can now ask the host directly.`
          : `${ctx.agent.name} will check with you before asking the host.`,
    }),
  ]);
}

/** End with punctuation exactly once. */
const sentence = (s: string) =>
  /[.?!]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;
