"use client";

import { useState, type FormEvent } from "react";
import { LEAD_INTENTS, type LeadIntent } from "@/core/lead";

type Step = "name" | "email" | "intent" | "done";
const ORDER: Step[] = ["name", "email", "intent"];

/**
 * The early access list, one question at a time: name, email, what they'd use it for.
 * Short steps keep it light on a phone, and nothing is saved until the last one.
 */
export function EarlyAccess() {
  const [step, setStep] = useState<Step>("name");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [intent, setIntent] = useState<LeadIntent | null>(null);
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const at = ORDER.indexOf(step);
  const next = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep(ORDER[at + 1]!);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!intent) return setError("Pick one.");
    setBusy(true);
    setError(null);
    const source = new URLSearchParams(location.search).get("src");
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName, lastName, email, intent, note, source, website }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return setStep("done");
    setError(
      (await res?.json().catch(() => null))?.message ??
        "No connection. Try again.",
    );
  }

  if (step === "done") {
    return (
      <section className="early narrow" aria-live="polite">
        <h2 className="early-q">You&rsquo;re on the list, {firstName}.</h2>
        <p className="muted">
          We&rsquo;ll email {email} when there&rsquo;s a spot for you.
        </p>
      </section>
    );
  }

  return (
    <section className="early narrow" aria-label="Get early access">
      <p className="small muted">
        Get early access &middot; {at + 1} of {ORDER.length}
      </p>

      {step === "name" && (
        <form onSubmit={next} className="stack">
          <h2 className="early-q">What&rsquo;s your name?</h2>
          <div className="pair">
            <label className="field">
              <span>First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </label>
            <label className="field">
              <span>Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </label>
          </div>
          <button type="submit" className="button">
            Next
          </button>
        </form>
      )}

      {step === "email" && (
        <form onSubmit={next} className="stack">
          <h2 className="early-q">Where should we reach you, {firstName}?</h2>
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
          <div className="actions">
            <button type="submit" className="button">
              Next
            </button>
            <button type="button" className="button quiet" onClick={() => setStep("name")}>
              Back
            </button>
          </div>
        </form>
      )}

      {step === "intent" && (
        <form onSubmit={submit} className="stack">
          <h2 className="early-q">What would you use Omnipra for?</h2>
          <div className="choices" role="radiogroup">
            {LEAD_INTENTS.map((o) => (
              <label key={o.value} className={intent === o.value ? "on" : undefined}>
                <input
                  type="radio"
                  name="intent"
                  value={o.value}
                  checked={intent === o.value}
                  onChange={() => setIntent(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          {intent === "other" && (
            <label className="field">
              <span>Tell us a little</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                autoFocus
              />
            </label>
          )}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hp"
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="button" disabled={busy || !intent}>
              {busy ? "Joining" : "Join the list"}
            </button>
            <button type="button" className="button quiet" onClick={() => setStep("email")}>
              Back
            </button>
          </div>
          <p className="small muted">We&rsquo;ll only email you about Omnipra.</p>
        </form>
      )}
    </section>
  );
}
