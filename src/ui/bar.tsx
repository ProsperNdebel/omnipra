export function Dot({
  on = false,
  breathe = false,
}: {
  on?: boolean;
  breathe?: boolean;
}) {
  return (
    <span
      className={`dot${on ? " on" : ""}${breathe ? " breathe" : ""}`}
      aria-hidden="true"
    />
  );
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
