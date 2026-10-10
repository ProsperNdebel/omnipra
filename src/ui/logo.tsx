/**
 * The Omnipra mark: a ring (the room) and a dot set into it (the agent that's there).
 * Draws in the current text colour, so it works on light and dark.
 */
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "-0.15em" }}
    >
      <defs>
        <mask
          id="omnipra-mark"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="64"
          height="64"
        >
          <rect width="64" height="64" fill="#fff" />
          <circle cx="46.85" cy="17.15" r="12" fill="#000" />
        </mask>
      </defs>
      <circle
        cx="32"
        cy="32"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        mask="url(#omnipra-mark)"
      />
      <circle cx="46.85" cy="17.15" r="7.5" fill="currentColor" />
    </svg>
  );
}
