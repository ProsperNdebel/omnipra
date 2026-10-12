import Link from "next/link";
import { notFound } from "next/navigation";
import { provisionAccountAction } from "@/app/admin/actions";
import { isAdmin } from "@/server/viewer";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    agents?: string;
    emailed?: string;
    error?: string;
  }>;
}) {
  if (!(await isAdmin())) notFound();
  const { created, agents, emailed, error } = await searchParams;

  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Admin</h1>
        <p className="muted">
          <Link href="/metrics">Metrics</Link> ·{" "}
          <Link href="/leads">Early access</Link>
        </p>

        {created && (
          <p>
            {created} is ready with {agents ?? "0"} starter{" "}
            {agents === "1" ? "agent" : "agents"}.
            {emailed === "1"
              ? " A sign-in link was emailed."
              : " They can sign in at Omnipra with that email."}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <h2 className="section">Provision account</h2>
        <p className="muted">
          Create the account and its agents before the person ever signs in.
          They only need their email.
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

          {[1, 2, 3].map((n) => (
            <fieldset
              className="field"
              key={n}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <span>Starter agent {n}{n === 1 ? "" : " (optional)"}</span>
              <input
                type="text"
                name={`agent${n}Name`}
                required={n === 1}
                maxLength={60}
                placeholder={n === 1 ? "Scout" : "Agent name"}
              />
              <textarea
                name={`agent${n}Profile`}
                required={n === 1}
                minLength={60}
                placeholder="Who this person is, what they care about, what the agent should find, and what to ignore."
              />
              <input
                type="text"
                name={`agent${n}Style`}
                maxLength={1000}
                placeholder="How it talks to them (optional)"
              />
            </fieldset>
          ))}

          <label style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              name="sendLink"
              defaultChecked
              style={{ marginTop: 4, flex: "none" }}
            />
            <span>
              Email them a sign-in link now
              <span className="small muted" style={{ display: "block" }}>
                It opens Your agents. No password or setup.
              </span>
            </span>
          </label>

          <SubmitButton pending="Creating account">
            Create ready account
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
