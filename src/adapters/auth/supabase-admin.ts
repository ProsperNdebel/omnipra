import { createServerClient } from "@/adapters/store/supabase/client";

/**
 * Admin-only Supabase Auth operations. Uses the server secret and must never be
 * imported by a client component.
 */
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret)
    throw new Error("Supabase admin is not configured.");
  return createServerClient(url, secret);
}

/**
 * Return the auth id for this email, creating a confirmed passwordless user when
 * needed. createUser sends no email; the account can be fully prepared first.
 */
export async function ensureAuthUser(email: string): Promise<string> {
  const db = client();
  const clean = email.trim().toLowerCase();
  const made = await db.auth.admin.createUser({
    email: clean,
    email_confirm: true,
  });
  if (!made.error && made.data.user) return made.data.user.id;

  const duplicate = /already|registered|exists/i.test(made.error?.message ?? "");
  if (!duplicate)
    throw new Error(made.error?.message ?? "Could not create auth user.");

  // The auth user may already exist even if they have never signed in to Omnipra.
  const perPage = 100;
  for (let page = 1; page <= 100; page += 1) {
    const listed = await db.auth.admin.listUsers({ page, perPage });
    if (listed.error) throw new Error(listed.error.message);
    const found = listed.data.users.find(
      (u) => u.email?.toLowerCase() === clean,
    );
    if (found) return found.id;
    if (listed.data.users.length < perPage) break;
  }
  throw new Error("That auth user exists but could not be found.");
}
