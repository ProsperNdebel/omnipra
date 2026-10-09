"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Top bar, rendered once in the layout so it stays put while pages change.
 * Hidden on the host's session screen, which is deliberately full screen.
 */
/** `account`: null when sign in is off; otherwise whether someone is signed in. */
export function Nav({ account }: { account: boolean | null }) {
  const path = usePathname();
  if (/^\/host\/[^/]+$/.test(path)) return null;

  const here =
    path.startsWith("/agent") || path.startsWith("/m/")
      ? "agent"
      : path.startsWith("/host")
        ? "host"
        : "explore";
  const cur = (w: string) => (here === w ? ("page" as const) : undefined);

  return (
    <header className="bar page-head">
      <Link href="/" className="wordmark" aria-current={cur("explore")}>
        Omnipra
      </Link>
      <nav aria-label="Main">
        <Link href="/agent" aria-current={cur("agent")}>
          Your agents
        </Link>
        <Link href="/host" aria-current={cur("host")}>
          Hosting
        </Link>
        {account === false && <Link href="/signin">Sign in</Link>}
        {account && (
          <button
            type="button"
            className="linkish"
            onClick={async () => {
              await fetch("/api/auth/signout", { method: "POST" });
              location.assign("/");
            }}
          >
            Sign out
          </button>
        )}
      </nav>
    </header>
  );
}
