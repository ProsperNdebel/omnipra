"use client";

import { useState, type FormEvent } from "react";

/** Two steps: email, then the code from the email. */
export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return true;
    setError(
      (await res?.json().catch(() => null))?.error ??
        "No connection. Try again.",
    );
    return false;
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (await post("/api/auth/code", { email })) setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (await post("/api/auth/verify", { email, code })) location.assign(next);
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!sent ? (
        <form onSubmit={sendCode} className="stack">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </label>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Sending" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <label className="field">
            <span>Code</span>
            <small>
              Sent to {email}. Check spam if it isn&rsquo;t there in a minute.
            </small>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={10}
              required
              autoFocus
            />
          </label>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Signing in" : "Sign in"}
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setSent(false);
              setCode("");
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </>
  );
}
