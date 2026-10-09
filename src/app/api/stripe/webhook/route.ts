import { handlePaymentEvent } from "@/services";
import { getDeps } from "@/server/deps";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** POST: Stripe events, verified with STRIPE_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const d = getDeps();
  if (!d.payments)
    return Response.json({ error: "Payments are off." }, { status: 404 });
  const body = await req.text();
  const event = d.payments.verifyWebhook(
    body,
    req.headers.get("stripe-signature"),
  );
  if (!event)
    return Response.json({ error: "Bad signature." }, { status: 400 });
  try {
    await handlePaymentEvent(d, event);
    return Response.json({ received: true });
  } catch (err) {
    return errorResponse(err);
  }
}
