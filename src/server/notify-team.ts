/**
 * A short note to the team on OMNIPRA_ALERT_WEBHOOK (Slack or Discord incoming webhook),
 * if set. Fire and forget: never throws, never slows the response.
 */
export function notifyTeam(text: string): void {
  const hook = process.env.OMNIPRA_ALERT_WEBHOOK;
  if (!hook) return;
  const body = text.slice(0, 1500);
  void fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Slack reads `text`, Discord reads `content`.
    body: JSON.stringify({ text: body, content: body }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}
