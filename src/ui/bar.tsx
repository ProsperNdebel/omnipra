import Link from "next/link";

type Where = "explore" | "agent" | "host" | null;

/** Top bar. Three places only: where events are, your agent, and hosting. */
export function Bar({ here }: { here: Where }) {
  const cur = (w: Where) => (here === w ? ("page" as const) : undefined);
  return (
    <header className="bar">
      <Link href="/" className="wordmark" aria-current={cur("explore")}>
        Presence
      </Link>
      <nav aria-label="Main">
        <Link href="/agent" aria-current={cur("agent")}>
          Your agent
        </Link>
        <Link href="/host" aria-current={cur("host")}>
          Hosting
        </Link>
      </nav>
    </header>
  );
}

export function Dot({ on = false, breathe = false }: { on?: boolean; breathe?: boolean }) {
  return <span className={`dot${on ? " on" : ""}${breathe ? " breathe" : ""}`} aria-hidden="true" />;
}

/** Plain words for each status, from the viewer's side. */
export const STATUS_WORDS: Record<string, string> = {
  requested: "Waiting for the host",
  accepted: "Host accepted",
  declined: "Host declined",
  cancelled: "Cancelled",
  live: "Present now",
  ended: "Writing the briefing",
  briefed: "Briefing ready",
};
