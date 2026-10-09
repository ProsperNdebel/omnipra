import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentGateway } from "@/core";

/**
 * Stripe Connect over plain fetch: Express accounts for hosts, Checkout with a manual
 * capture hold for owners, destination charges so the host's share moves on capture.
 */
export class StripeGateway implements PaymentGateway {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string | null,
    private readonly base = "https://api.stripe.com",
  ) {}

  async createPayoutAccount({ email }: { email: string | null }) {
    const a = await this.call<{ id: string }>("POST", "/v1/accounts", {
      type: "express",
      ...(email ? { email } : {}),
      "capabilities[transfers][requested]": "true",
      "business_profile[product_description]":
        "Hosting AI agents at events through Omnipra",
    });
    return a.id;
  }

  async payoutOnboardingUrl(
    accountId: string,
    urls: { returnUrl: string; refreshUrl: string },
  ) {
    const link = await this.call<{ url: string }>("POST", "/v1/account_links", {
      account: accountId,
      type: "account_onboarding",
      return_url: urls.returnUrl,
      refresh_url: urls.refreshUrl,
    });
    return link.url;
  }

  async payoutReady(accountId: string) {
    const a = await this.call<{
      payouts_enabled?: boolean;
      capabilities?: { transfers?: string };
    }>("GET", `/v1/accounts/${encodeURIComponent(accountId)}`);
    return !!a.payouts_enabled && a.capabilities?.transfers === "active";
  }

  async createCheckout(input: Parameters<PaymentGateway["createCheckout"]>[0]) {
    const s = await this.call<{ id: string; url: string }>(
      "POST",
      "/v1/checkout/sessions",
      {
        mode: "payment",
        client_reference_id: input.reference,
        "metadata[manifestation_id]": input.reference,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency,
        "line_items[0][price_data][unit_amount]": String(input.amountCents),
        "line_items[0][price_data][product_data][name]": input.description,
        "payment_intent_data[capture_method]": "manual",
        "payment_intent_data[application_fee_amount]": String(input.feeCents),
        "payment_intent_data[transfer_data][destination]":
          input.destinationAccountId,
        "payment_intent_data[metadata][manifestation_id]": input.reference,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
    );
    return { id: s.id, url: s.url };
  }

  async checkoutResult(checkoutId: string) {
    const s = await this.call<{
      status?: string;
      payment_intent?: string | { id: string; status: string } | null;
    }>(
      "GET",
      `/v1/checkout/sessions/${encodeURIComponent(checkoutId)}?expand[]=payment_intent`,
    );
    const pi = s.payment_intent;
    const intent = typeof pi === "string" ? { id: pi, status: "" } : pi;
    return {
      intentId: intent?.id ?? null,
      held:
        s.status === "complete" &&
        (intent?.status === "requires_capture" ||
          intent?.status === "succeeded"),
    };
  }

  async capture(intentId: string) {
    await this.call(
      "POST",
      `/v1/payment_intents/${encodeURIComponent(intentId)}/capture`,
      {},
    );
  }

  async release(intentId: string) {
    await this.call(
      "POST",
      `/v1/payment_intents/${encodeURIComponent(intentId)}/cancel`,
      {},
    );
  }

  verifyWebhook(body: string, signature: string | null) {
    if (!this.webhookSecret || !signature) return null;
    const parts = Object.fromEntries(
      signature.split(",").map((kv) => kv.split("=") as [string, string]),
    );
    const t = Number(parts.t);
    if (!t || Math.abs(Date.now() / 1000 - t) > 300) return null;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${t}.${body}`)
      .digest();
    const ok = signature
      .split(",")
      .filter((kv) => kv.startsWith("v1="))
      .some((kv) => {
        const got = Buffer.from(kv.slice(3), "hex");
        return got.length === expected.length && timingSafeEqual(got, expected);
      });
    if (!ok) return null;
    const event = JSON.parse(body) as {
      type: string;
      data: { object: Record<string, unknown> };
    };
    return { type: event.type, object: event.data.object };
  }

  private async call<T = unknown>(
    method: "GET" | "POST",
    path: string,
    form?: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        ...(form
          ? { "content-type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!res.ok)
      throw new Error(
        `Stripe ${method} ${path.split("?")[0]}: ${json.error?.message ?? res.status}`,
      );
    return json as T;
  }
}
