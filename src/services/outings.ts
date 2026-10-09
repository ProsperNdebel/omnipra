import {
  decideOuting,
  DomainError,
  fitBudget,
  type EventId,
  type MissionId,
  type Outing,
  type OutingId,
  type OutingPick,
  type ScoutCandidate,
  type UserId,
} from "@/core";
import { recallMemory, type Deps } from "@/pipeline";
import { ownedAgent } from "./agents";
import { sendAgent } from "./missions";

/** Sessions that still hold a place at an event; a declined or cancelled one doesn't. */
const HOLDING = new Set(["requested", "accepted", "live", "ended", "briefed"]);
const MAX_DAYS = 30;
const MAX_BUDGET_CENTS = 100_000;

/**
 * The agent proposes where it should be: every listed event in the window it isn't
 * already going to, ranked against the owner's goals, within budget. Books nothing.
 */
export async function scout(
  d: Deps,
  ownerId: UserId,
  agentId: string,
  input: { request: string; budgetCents: number; days: number },
): Promise<Outing> {
  const agent = await ownedAgent(d, ownerId, agentId);
  const request = input.request.trim();
  if (!request)
    throw new DomainError(
      "bad_request",
      "Say what kind of events you're after.",
    );
  if (
    !Number.isInteger(input.budgetCents) ||
    input.budgetCents <= 0 ||
    input.budgetCents > MAX_BUDGET_CENTS
  )
    throw new DomainError("bad_request", "Set a budget between $1 and $1,000.");
  const days = Math.min(Math.max(Math.round(input.days) || 7, 1), MAX_DAYS);

  const now = new Date(d.now());
  const from = now.toISOString();
  const to = new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString();
  const [events, mine] = await Promise.all([
    d.repos.events.list({ from, to }),
    d.repos.manifestations.contexts({ agentIds: [agent.id] }),
  ]);
  const already = new Set(
    mine
      .filter((c) => HOLDING.has(c.manifestation.status))
      .map((c) => c.event.id),
  );
  const open = events.filter(
    (e) =>
      e.capturePolicy !== "none" && e.startsAt > from && !already.has(e.id),
  );
  const listings = await d.repos.events.listingsFor(open.map((e) => e.id));
  const candidates: ScoutCandidate[] = open
    .map((event) => ({
      event,
      hosts: listings
        .filter((l) => l.eventId === event.id && l.offers.includes("mic"))
        .map((l) => ({
          hostId: l.hostId,
          displayName: l.displayName,
          priceCents: l.priceCents,
          openToRequests: l.openToRequests,
        })),
    }))
    .filter((c) => c.hosts.length > 0);

  const memories = await recallMemory(d, agent.id, request);
  const out = await d.agent.scout({
    agent,
    memories,
    request,
    budgetCents: input.budgetCents,
    candidates,
  });

  // Only real hosts at real candidate events, with what Omnipra knows about them.
  const byEvent = new Map(candidates.map((c) => [c.event.id, c]));
  const proposed: OutingPick[] = out.picks.flatMap((p) => {
    const c = byEvent.get(p.eventId);
    const h = c?.hosts.find((x) => x.hostId === p.hostId);
    return c && h
      ? [
          {
            eventId: c.event.id,
            eventTitle: c.event.title,
            startsAt: c.event.startsAt,
            hostId: h.hostId,
            hostName: h.displayName,
            priceCents: h.priceCents,
            why: p.why,
            instructions: p.instructions || request,
          },
        ]
      : [];
  });
  const { picks, overBudget } = fitBudget(proposed, input.budgetCents);
  const title = (id: EventId) => byEvent.get(id)?.event.title ?? "An event";

  const outing: Outing = {
    id: d.newId() as OutingId,
    agentId: agent.id,
    request,
    budgetCents: input.budgetCents,
    from,
    to,
    picks,
    skipped: [
      ...overBudget.map((p) => ({
        eventId: p.eventId,
        title: p.eventTitle,
        why: `Would go over budget ($${(p.priceCents / 100).toFixed(0)}).`,
      })),
      ...out.skipped
        .filter((s) => !picks.some((p) => p.eventId === s.eventId))
        .map((s) => ({
          eventId: s.eventId,
          title: title(s.eventId),
          why: s.why,
        })),
    ],
    status: "proposed",
    manifestationIds: [],
    createdAt: d.now(),
    decidedAt: null,
  };
  await d.repos.outings.save(outing);
  return outing;
}

/**
 * The owner approves: send the agent to every pick, each with its own mission.
 * A pick whose host has since left is skipped rather than failing the rest.
 * Returns the missions created, so their plans can be drafted.
 */
export async function bookOuting(
  d: Deps,
  ownerId: UserId,
  outingId: string,
): Promise<MissionId[]> {
  const o = await d.repos.outings.get(outingId as OutingId);
  if (!o) throw new DomainError("not_found", "That plan is gone.");
  await ownedAgent(d, ownerId, o.agentId);
  if (o.status !== "proposed")
    throw new DomainError(
      "invalid_transition",
      `That plan is already ${o.status}.`,
    );

  const sessions = [];
  for (const p of o.picks) {
    try {
      sessions.push(
        await sendAgent(d, {
          ownerId,
          agentId: o.agentId,
          eventId: p.eventId,
          hostId: p.hostId,
          instructions: p.instructions,
          alerts: [],
          autonomy: "ask_first",
        }),
      );
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
    }
  }
  await d.repos.outings.save(
    decideOuting(
      o,
      "book",
      d.now(),
      sessions.map((m) => m.id),
    ),
  );
  return sessions.map((m) => m.missionId);
}

export async function dismissOuting(
  d: Deps,
  ownerId: UserId,
  outingId: string,
) {
  const o = await d.repos.outings.get(outingId as OutingId);
  if (!o) throw new DomainError("not_found", "That plan is gone.");
  await ownedAgent(d, ownerId, o.agentId);
  await d.repos.outings.save(decideOuting(o, "dismiss", d.now()));
}

/** The latest few, newest first, for the agent page. */
export async function agentOutings(d: Deps, agentId: string) {
  return (await d.repos.outings.byAgent(agentId as Outing["agentId"]))
    .filter((o) => o.status !== "dismissed")
    .slice(0, 3);
}
