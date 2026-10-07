import { cookies } from "next/headers";
import type { UserId } from "@/core";
import { VIEWER_COOKIE } from "./viewer-cookie";

export { VIEWER_COOKIE };

/**
 * Stopgap identity: an anonymous id in an httpOnly cookie, set by middleware.
 * Identity is per browser, so a host must list themselves and run the session
 * from the same phone browser. Supabase Auth replaces this; callers won't change.
 */

export async function viewerId(): Promise<UserId> {
  const id = (await cookies()).get(VIEWER_COOKIE)?.value;
  if (!id) throw new Error("viewer cookie missing; is middleware running?");
  return id as UserId;
}
