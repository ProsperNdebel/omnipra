"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Reads the session Supabase put in the URL hash and hands it to the server. */
export function FinishSignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(location.hash.slice(1));
    // Drop the tokens from the address bar and history straight away.
    history.replaceState(null, "", location.pathname + location.search);
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (!access || !refresh) {
      setError(
        hash.get("error_description")?.replace(/\+/g, " ") ??
          "That link is missing its sign in details.",
      );
      return;
    }
    void fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: access, refresh_token: refresh }),
    })
      .then(async (res) => {
        if (res.ok) location.replace(next);
        else
          setError(
            (await res.json().catch(() => null))?.error ??
              "That link didn't work.",
          );
      })
      .catch(() => setError("No connection. Try the link again."));
  }, [next]);

  if (!error) return <h1 className="title">Signing you in</h1>;
  return (
    <>
      <h1 className="title">Sign in</h1>
      <p className="error" role="alert">
        {error} Links work once and expire after an hour.
      </p>
      <p>
        <Link href={`/signin?next=${encodeURIComponent(next)}`}>
          Send a new link
        </Link>
      </p>
    </>
  );
}
