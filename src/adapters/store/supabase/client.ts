import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server only client using the secret key. It bypasses RLS, so it must never be
 * imported from client components. The secret key has no NEXT_PUBLIC_ prefix, so
 * Next won't bundle it for the browser even by accident.
 */
export function createServerClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Unwrap a Supabase response, turning its error into a thrown Error. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}
