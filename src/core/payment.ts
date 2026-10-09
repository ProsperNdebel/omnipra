import type { Manifestation } from "./manifestation";
import type { ISODate, ManifestationId, UserId } from "./ids";

/**
 * Owners pay hosts through Omnipra. The card is authorized when the agent is sent
 * (a hold, nothing charged), then charged only if the session really happened, or
 * released if it didn't. Omnipra keeps a fee; the rest goes to the host.
 *
 * pending: checkout started, not finished. authorized: the hold is in place.
 * captured: charged. released: the hold was dropped, nothing charged. failed: the
 * charge or hold failed (expired, declined).
 */
export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "released"
  | "failed";

export interface Payment {
  manifestationId: ManifestationId;
  ownerId: UserId;
  hostId: UserId;
  amountCents: number;
  /** Omnipra's share. The host gets amount minus fee. */
  feeCents: number;
  currency: "usd";
  status: PaymentStatus;
  checkoutId: string | null;
  intentId: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Where a host's money goes: their account with the payment provider. */
export interface PayoutAccount {
  userId: UserId;
  providerAccountId: string;
  /** Verified and able to receive transfers. */
  ready: boolean;
  updatedAt: ISODate;
}

/** A session shorter than this is not charged: the host didn't really carry the agent. */
export const MIN_LIVE_MINUTES_TO_CHARGE = 10;

export function platformFee(amountCents: number, percent: number): number {
  return Math.round((amountCents * Math.min(Math.max(percent, 0), 50)) / 100);
}

/** What to do with a held payment, given where the session is. */
export function settlement(
  m: Pick<Manifestation, "status" | "startedAt" | "endedAt">,
): "capture" | "release" | "wait" {
  if (m.status === "declined" || m.status === "cancelled") return "release";
  if (m.status !== "ended" && m.status !== "briefed") return "wait";
  if (!m.startedAt || !m.endedAt) return "release";
  const minutes = (Date.parse(m.endedAt) - Date.parse(m.startedAt)) / 60_000;
  return minutes >= MIN_LIVE_MINUTES_TO_CHARGE ? "capture" : "release";
}

/** Whether a session can go ahead: free, or its payment is held or done. */
export function paid(payment: Payment | null, priceCents: number): boolean {
  if (priceCents <= 0) return true;
  return payment?.status === "authorized" || payment?.status === "captured";
}
