/**
 * Unexpected errors: one structured log line (searchable in the host's logs), and a
 * message to OMNIPRA_ALERT_WEBHOOK if set (a Slack or Discord incoming webhook URL
 * works). Never throws.
 */
export function reportError(err: unknown, where: string): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(
    JSON.stringify({
      level: "error",
      where,
      message: e.message,
      stack: e.stack?.split("\n").slice(0, 6).join("\n"),
      at: new Date().toISOString(),
    }),
  );
  const hook = process.env.OMNIPRA_ALERT_WEBHOOK;
  if (!hook) return;
  const text = `Omnipra error in ${where}: ${e.message}`.slice(0, 1500);
  void fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Slack reads `text`, Discord reads `content`.
    body: JSON.stringify({ text, content: text }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}
