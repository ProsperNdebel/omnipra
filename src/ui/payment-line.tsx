import { payAction } from "@/app/actions";
import {
  MIN_LIVE_MINUTES_TO_CHARGE,
  type ManifestationStatus,
  type Payment,
} from "@/core";
import { money } from "./format";
import { SubmitButton } from "./submit-button";

/** Where the owner's money stands for this session. Nothing when payments are off. */
export function PaymentLine({
  id,
  status,
  priceCents,
  payment,
  on,
  hostName,
}: {
  id: string;
  status: ManifestationStatus;
  priceCents: number;
  payment: Payment | null;
  on: boolean;
  hostName: string;
}) {
  if (!on || priceCents <= 0) return null;
  const amount = money(priceCents);
  const s = payment?.status ?? "pending";

  if (s === "pending" && status === "requested")
    return (
      <form action={payAction} className="actions" style={{ marginTop: 20 }}>
        <input type="hidden" name="id" value={id} />
        <p className="small" style={{ margin: 0 }}>
          Waiting for payment. {hostName} sees the request once your card is
          held.
        </p>
        <SubmitButton pending="Opening checkout">Pay {amount}</SubmitButton>
      </form>
    );

  const words: Record<string, string> = {
    authorized: `${amount} held on your card. Charged when the session ends, if it runs at least ${MIN_LIVE_MINUTES_TO_CHARGE} minutes.`,
    captured: `Paid ${amount}.`,
    released: `Not charged. The ${amount} hold was released.`,
    failed: `The ${amount} payment didn't go through.`,
    pending: "Not paid.",
  };
  return <p className="small muted">{words[s]}</p>;
}
