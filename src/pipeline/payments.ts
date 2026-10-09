import { settlement, type ManifestationId } from "@/core";
import type { Deps } from "./deps";

/**
 * Charge or release a session's held payment once its outcome is known: declined,
 * cancelled or under 10 minutes live is released; otherwise it's charged and the
 * host's share moves to them. Safe to repeat. Throws on provider errors so the job
 * retries.
 */
export async function settle(d: Deps, id: ManifestationId): Promise<void> {
  if (!d.payments) return;
  const [payment, m] = await Promise.all([
    d.repos.payments.get(id),
    d.repos.manifestations.get(id),
  ]);
  if (!payment || !m) return;
  const decision = settlement(m);
  if (decision === "wait") return;

  if (payment.status === "pending") {
    // Never paid: nothing is held, so there is nothing to charge or release.
    if (decision === "release")
      await d.repos.payments.save({
        ...payment,
        status: "released",
        updatedAt: d.now(),
      });
    return;
  }
  if (payment.status !== "authorized" || !payment.intentId) return;

  if (decision === "capture") {
    try {
      await d.payments.capture(payment.intentId);
    } catch (e) {
      // A hold lasts about 7 days; after that the charge fails for good.
      if (/expired|canceled|cancelled/i.test(String(e))) {
        await d.repos.payments.save({
          ...payment,
          status: "failed",
          updatedAt: d.now(),
        });
        return;
      }
      throw e;
    }
  } else {
    await d.payments.release(payment.intentId);
  }
  await d.repos.payments.save({
    ...payment,
    status: decision === "capture" ? "captured" : "released",
    updatedAt: d.now(),
  });
}
