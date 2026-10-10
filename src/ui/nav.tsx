"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "./logo";

const POLL_MS = 20_000;

/**
 * What's waiting on you, polled while the app is open. Also shown in the tab title
 * and, where the browser allows (installed web apps), on the app icon.
 */
function useBadges(enabled: boolean) {
  const [b, setB] = useState({ agents: 0, hosting: 0 });
  const path = usePathname();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/badges").catch(() => null);
      if (alive && res?.ok) setB(await res.json());
    };
    void load();
    const t = setInterval(load, POLL_MS);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, [enabled, path]);
  useEffect(() => {
    const total = b.agents + b.hosting;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = total ? `(${total}) ${base}` : base;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    void (total ? nav.setAppBadge?.(total) : nav.clearAppBadge?.())?.catch(
      () => {},
    );
  }, [b, path]);
  return b;
}

const Count = ({ n, what }: { n: number; what: string }) =>
  n > 0 ? (
    <span className="badge" aria-label={`${n} ${what}`}>
      {n > 99 ? "99+" : n}
    </span>
  ) : null;

/**
 * Top bar, rendered once in the layout so it stays put while pages change.
 * Hidden on the host's session screen, which is deliberately full screen.
 */
/** `account`: null when sign in is off; otherwise whether someone is signed in. */
export function Nav({ account }: { account: boolean | null }) {
  const path = usePathname();
  const b = useBadges(account !== false);
  const [open, setOpen] = useState(false);
  // A tap on a link (or anywhere that changes the page) closes the phone menu.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (/^\/host\/[^/]+$/.test(path)) return null;

  const here =
    path.startsWith("/agent") || path.startsWith("/m/")
      ? "agent"
      : path.startsWith("/host")
        ? "host"
        : path.startsWith("/notify")
          ? "notify"
          : "explore";
  const cur = (w: string) => (here === w ? ("page" as const) : undefined);
  const waiting = b.agents + b.hosting;

  return (
    <header className="bar page-head">
      <Link href="/" className="wordmark" aria-current={cur("explore")}>
        <LogoMark />
        Omnipra
      </Link>
      <button
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="main-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={open ? "burger x" : "burger"} aria-hidden="true">
          <span />
          <span />
        </span>
        {!open && <Count n={waiting} what="waiting on you" />}
      </button>
      <nav aria-label="Main" id="main-nav" className={open ? "main open" : "main"}>
        <Link href="/agent" aria-current={cur("agent")}>
          Your agents
          <Count n={b.agents} what="waiting on you" />
        </Link>
        <Link href="/host" aria-current={cur("host")}>
          Hosting
          <Count n={b.hosting} what="waiting on you" />
        </Link>
        {/* The early access list is for people not using Omnipra yet. */}
        {!account && (
          <Link href="/notify" aria-current={cur("notify")} className="strong">
            Notify me
          </Link>
        )}
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
