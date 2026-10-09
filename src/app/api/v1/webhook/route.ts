import { DomainError } from "@/core";
import { setWebhook } from "@/services";
import { withCaller } from "@/server/api";

export const runtime = "nodejs";

/** GET: this key's webhook, if any, with its signing secret. */
export function GET(req: Request) {
  return withCaller(req, async (_d, { key }) => ({
    url: key.webhookUrl,
    secret: key.webhookUrl ? key.webhookSecret : null,
  }));
}

/** PUT { url }: send this agent's events to url. Returns the signing secret. */
export function PUT(req: Request) {
  return withCaller(req, async (d, { key }) => {
    const body = (await req.json().catch(() => null)) as { url?: unknown };
    if (typeof body?.url !== "string")
      throw new DomainError("bad_request", 'Send { "url": "https://..." }.');
    return setWebhook(d, key, body.url);
  });
}

/** DELETE: stop sending events. */
export function DELETE(req: Request) {
  return withCaller(req, (d, { key }) => setWebhook(d, key, null));
}
