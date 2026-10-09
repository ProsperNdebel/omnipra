import { cookies } from "next/headers";
import { DomainError, type UserId } from "@/core";
import type { AuthUser } from "@/adapters/auth/gotrue";
import { ACCESS_COOKIE, authEnabled, goTrue } from "./auth-config";
import { getDeps } from "./deps";
import { VIEWER_COOKIE } from "./viewer-cookie";

export { VIEWER_COOKIE };

/**
 * Who is asking. With sign in on (see authEnabled), the signed in account's user;
 * middleware keeps the session fresh and sends anyone signed out to /signin. Off, an
 * anonymous id per browser from an httpOnly cookie.
 */
export async function viewerId(): Promise<UserId> {
  const jar = await cookies();
  const guest = jar.get(VIEWER_COOKIE)?.value as UserId | undefined;
  if (!authEnabled()) {
    if (!guest)
      throw new Error("viewer cookie missing; is middleware running?");
    return guest;
  }
  const token = jar.get(ACCESS_COOKIE)?.value;
  const user = token ? await userFor(token) : null;
  if (!user) throw new DomainError("unauthorized", "Sign in to continue.");
  return accountFor(user, guest ?? (user.id as UserId));
}

/** Whether someone is signed in (or sign in is off). For showing sign in or out. */
export async function signedIn(): Promise<boolean> {
  // Read cookies first either way, so pages are never prerendered with a stale answer.
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return authEnabled() && !!token;
}

// Checking a token costs a round trip to Supabase, so remember answers briefly.
const users = new Map<string, { user: AuthUser | null; until: number }>();
const accounts = new Map<string, UserId>();

async function userFor(token: string): Promise<AuthUser | null> {
  const hit = users.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const user = await goTrue().user(token);
  if (users.size > 5000) users.clear();
  users.set(token, { user, until: Date.now() + 60_000 });
  return user;
}

async function accountFor(user: AuthUser, guest: UserId): Promise<UserId> {
  const known = accounts.get(user.id);
  if (known) return known;
  const id = await getDeps().repos.accounts.claim(user.id, guest, user.email);
  accounts.set(user.id, id);
  return id;
}

/**
 * Who may see Omnipra wide numbers (/metrics). With sign in on: emails listed in
 * OMNIPRA_ADMIN_EMAILS. Without it: anyone, but only while developing.
 */
export async function isAdmin(): Promise<boolean> {
  if (!authEnabled()) return process.env.NODE_ENV !== "production";
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const email = token ? (await userFor(token))?.email : null;
  const admins = (process.env.OMNIPRA_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
}
