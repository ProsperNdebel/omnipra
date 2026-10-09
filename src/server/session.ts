import { cookies } from "next/headers";
import type { AuthSession } from "@/adapters/auth/gotrue";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  goTrue,
  sessionCookieOptions,
} from "./auth-config";

/** Store a fresh sign in as httpOnly cookies. Route handlers and server actions only. */
export async function startSession(s: AuthSession): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, s.accessToken, sessionCookieOptions());
  jar.set(REFRESH_COOKIE, s.refreshToken, sessionCookieOptions());
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) await goTrue().signOut(access);
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Only same site paths, so a crafted link can't bounce someone elsewhere after sign in. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/agent";
}
