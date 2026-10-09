"use client";

import { useEffect } from "react";

/**
 * If Supabase sends a sign in link to the Site URL instead of /auth/callback (the
 * callback isn't in its Redirect URLs), finish the sign in anyway.
 */
export function HashSession() {
  useEffect(() => {
    if (
      location.pathname !== "/auth/callback" &&
      /(^|&)(access_token|error_description)=/.test(location.hash.slice(1))
    )
      location.replace(`/auth/callback?next=%2Fagent${location.hash}`);
  }, []);
  return null;
}
