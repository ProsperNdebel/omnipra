import Link from "next/link";
import { notFound } from "next/navigation";
import {
  openAccountAction,
  provisionAccountAction,
} from "@/app/admin/actions";
import { isAdmin } from "@/server/viewer";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  if (!(await isAdmin())) notFound();
  const { created, error } = await searchParams;

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Admin</h1>
        <p className="muted">
          <Link href="/metrics">Metrics</Link> ·{" "}
          <Link href="/leads">Early access</Link>
        </p>

        {created && (
          <section>
            <p>
              Account ready for <strong>{created}</strong>.
            </p>
            <p className="muted small">
              Open it to create their agents using the normal Omnipra screens.
              This browser will temporarily become that user.
            </p>
            <form action={openAccountAction} style={{ marginTop: 16 }}>
              <input type="hidden" name="email" value={created} />
              <SubmitButton pending="Opening account">
                Open their account
              </SubmitButton>
            </form>
          </section>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <h2 className="section">Create account</h2>
        <p className="muted">
          Create their Omnipra account first. Then open it and set up their
          agents for them.
        </p>

        <form action={provisionAccountAction} className="stack">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder="person@example.com"
            />
          </label>
          <SubmitButton pending="Creating account">
            Create account
          </SubmitButton>
        </form>

        <h2 className="section">Open an existing account</h2>
        <p className="muted small">
          Use this when the account already exists and you want to configure it.
        </p>
        <form action={openAccountAction} className="stack">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="off"
              placeholder="person@example.com"
            />
          </label>
          <SubmitButton quiet pending="Opening account">
            Open account
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
