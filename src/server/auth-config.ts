import { GoTrue } from "@/adapters/auth/gotrue";

/**
 * Sign in is on when OMNIPRA_AUTH=1 and Supabase is configured. Off, every browser
 * gets an anonymous identity (fine on your own machine, not for strangers).
 * Edge safe: imported by middleware.
 */
export function authEnabled(): boolean {
  return (
    process.env.OMNIPRA_AUTH === "1" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function goTrue(): GoTrue {
  return new GoTrue(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

export const ACCESS_COOKIE = "omni_at";
export const REFRESH_COOKIE = "omni_rt";

const YEAR = 60 * 60 * 24 * 365;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: YEAR,
  };
}

/** Pages anyone can open without signing in. Everything else asks for sign in. */
export function isPublicPath(path: string): boolean {
  return (
    path === "/" ||
    path === "/signin" ||
    path.startsWith("/auth/") ||
    path === "/developers" ||
    // Machines: API keys, device tokens, the scheduler and dev checks bring their own auth.
    path.startsWith("/api/v1/") ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/cron/") ||
    path.startsWith("/api/dev/") ||
    path.startsWith("/api/stripe/") ||
    path === "/api/health" ||
    // The early access form (GET, the CSV export, checks for an admin itself).
    path === "/api/leads"
  );
}
