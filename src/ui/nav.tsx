"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Top bar, rendered once in the layout so it stays put while pages change.
 * Hidden on the host's session screen, which is deliberately full screen.
 */
export function Nav() {
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
      </nav>
    </header>
  );
}
