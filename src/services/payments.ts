import {
  DomainError,
  paid,
  platformFee,
  type ManifestationId,
  type Payment,
  type SessionContext,
  type UserId,
} from "@/core";
import { loadContext, type Deps } from "@/pipeline";

/** Omnipra's cut of each paid session, in percent. */
const FEE_PERCENT = Number(process.env.OMNIPRA_FEE_PERCENT ?? 15);

export type PayoutState = "off" | "none" | "pending" | "ready";

/** Whether a host can be paid through Omnipra yet. Refreshes from the provider until ready. */
export async function payoutState(
  d: Deps,
  hostId: UserId,
): Promise<PayoutState> {
  if (!d.payments) return "off";
  const acct = await d.repos.payoutAccounts.get(hostId);
  if (!acct) return "none";
  if (acct.ready) return "ready";
  const ready = await d.payments
    .payoutReady(acct.providerAccountId)
    .catch(() => false);
  if (ready)
    await d.repos.payoutAccounts.save({ ...acct, ready, updatedAt: d.now() });
  return ready ? "ready" : "pending";
}

/** Where the host goes to set up (or finish setting up) payouts with the provider. */
export async function payoutSetupUrl(
  d: Deps,
  hostId: UserId,
  email: string | null,
  origin: string,
): Promise<string> {
  if (!d.payments)
    throw new DomainError("bad_request", "Payments aren't turned on.");
  let acct = await d.repos.payoutAccounts.get(hostId);
  if (!acct) {
    acct = {
      userId: hostId,
      providerAccountId: await d.payments.createPayoutAccount({ email }),
      ready: false,
      updatedAt: d.now(),
    };
    await d.repos.payoutAccounts.save(acct);
  }
  return d.payments.payoutOnboardingUrl(acct.providerAccountId, {
    returnUrl: `${origin}/api/payouts/return`,
    refreshUrl: `${origin}/api/payouts/start`,
  });
}

/** Whether booking this host needs a payment through Omnipra. */
export function needsPayment(d: Deps, priceCents: number): boolean {
  return !!d.payments && priceCents > 0;
}

/** Refuse a paid booking with a host who can't receive money yet. */
export async function assertHostCanBePaid(
  d: Deps,
  hostId: UserId,
  priceCents: number,
): Promise<void> {
  if (!needsPayment(d, priceCents)) return;
  if ((await payoutState(d, hostId)) !== "ready")
    throw new DomainError(
      "bad_request",
      "This host hasn't set up payouts yet, so they can't be booked.",
    );
}

/**
 * Send the owner to pay for a session. Nothing is charged: the card is held and
 * charged only if the session happens. Null when no payment is needed.
 */
export async function startCheckout(
  d: Deps,
  ownerId: UserId,
  manifestationId: string,
  origin: string,
): Promise<string | null> {
  const ctx = await loadContext(d, manifestationId as ManifestationId);
  if (ctx.agent.ownerId !== ownerId)
    throw new DomainError("forbidden", "Not your session.");
  const m = ctx.manifestation;
  if (!d.payments || !needsPayment(d, m.priceCents)) return null;
  if (m.status !== "requested")
    throw new DomainError("bad_request", "This session can't be paid for now.");
  const existing = await d.repos.payments.get(m.id);
  if (paid(existing, m.priceCents)) return null;

  const hostId = ctx.endpoint.hostId;
  const acct = await d.repos.payoutAccounts.get(hostId);
  if (!acct?.ready)
    throw new DomainError(
      "bad_request",
      "This host can't receive payments yet.",
    );
  const feeCents = platformFee(m.priceCents, FEE_PERCENT);
  const checkout = await d.payments.createCheckout({
    amountCents: m.priceCents,
    feeCents,
    currency: "usd",
    destinationAccountId: acct.providerAccountId,
    description: `${ctx.agent.name} at ${ctx.event.title}`,
    reference: m.id,
    successUrl: `${origin}/m/${m.id}?paid=1`,
    cancelUrl: `${origin}/m/${m.id}`,
  });
  const now = d.now();
  await d.repos.payments.save({
    manifestationId: m.id,
    ownerId,
    hostId,
    amountCents: m.priceCents,
    feeCents,
    currency: "usd",
    status: "pending",
    checkoutId: checkout.id,
    intentId: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return checkout.url;
}

/** Check a finished checkout with the provider and record the hold. Safe to repeat. */
export async function confirmCheckout(
  d: Deps,
  manifestationId: string,
): Promise<Payment | null> {
  const p = await d.repos.payments.get(manifestationId as ManifestationId);
  if (!d.payments || !p || p.status !== "pending" || !p.checkoutId) return p;
  const r = await d.payments.checkoutResult(p.checkoutId);
  if (!r.held) return p;
  const next: Payment = {
    ...p,
    status: "authorized",
    intentId: r.intentId,
    updatedAt: d.now(),
  };
  await d.repos.payments.save(next);
  return next;
}

/** A verified provider event. Unknown kinds are ignored. */
export async function handlePaymentEvent(
  d: Deps,
  e: { type: string; object: Record<string, unknown> },
): Promise<void> {
  if (e.type === "checkout.session.completed") {
    const ref = e.object.client_reference_id;
    if (typeof ref === "string") await confirmCheckout(d, ref);
  }
}

/** Sessions still waiting on the owner's payment, so hosts don't see them yet. */
export async function awaitingPayment(
  d: Deps,
  sessions: SessionContext[],
): Promise<Set<string>> {
  if (!d.payments) return new Set();
  const requested = sessions.filter(
    (c) =>
      c.manifestation.status === "requested" && c.manifestation.priceCents > 0,
  );
  const payments = await d.repos.payments.byManifestations(
    requested.map((c) => c.manifestation.id),
  );
  const byId = new Map(payments.map((p) => [p.manifestationId as string, p]));
  return new Set(
    requested
      .filter(
        (c) =>
          !paid(
            byId.get(c.manifestation.id) ?? null,
            c.manifestation.priceCents,
          ),
      )
      .map((c) => c.manifestation.id as string),
  );
}

/** The payment line the owner sees on a session. */
export async function paymentView(
  d: Deps,
  manifestationId: string,
): Promise<Payment | null> {
  if (!d.payments) return null;
  return d.repos.payments.get(manifestationId as ManifestationId);
}
