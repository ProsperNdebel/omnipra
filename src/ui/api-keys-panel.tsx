"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeKeyAction } from "@/app/actions";
import { fmtDay } from "./format";
import { SubmitButton } from "./submit-button";

/**
 * Keys that let an outside agent use Omnipra as this agent. The secret appears once,
 * right after it's made, and is never stored or shown again.
 */
export function ApiKeysPanel({
  agentId,
  name,
  keys,
}: {
  agentId: string;
  name: string;
  keys: {
    id: string;
    label: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  }[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/agents/${agentId}/keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(() => null);
    if (res?.ok) {
      setSecret((await res.json()).secret);
      setLabel("");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <section id="api" className="narrow">
      <h2 className="section">Outside agents</h2>
      <p className="muted small">
        Let another AI agent use Omnipra as {name}: find events, go to them,
        read what&rsquo;s heard and ask hosts for things. It gets your rights
        over {name} and nothing else.{" "}
        <Link href="/developers">How it works</Link>
      </p>

      {secret && (
        <div
          className="proposal"
          style={{ marginTop: 16, padding: 16, border: "1px solid var(--ink)" }}
        >
          <div className="small muted">
            Your new key. Copy it now; it won&rsquo;t be shown again.
          </div>
          <code
            style={{ display: "block", marginTop: 8, wordBreak: "break-all" }}
          >
            {secret}
          </code>
          <div className="actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(secret).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="button quiet"
              onClick={() => setSecret(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {keys.length > 0 && (
        <ul className="rows">
          {keys.map((k) => (
            <li key={k.id}>
              <div>
                <div>{k.label}</div>
                <div className="small muted">
                  {k.prefix}..., made {fmtDay(k.createdAt)}
                  {k.lastUsedAt
                    ? `, last used ${fmtDay(k.lastUsedAt)}`
                    : ", never used"}
                </div>
              </div>
              <form action={revokeKeyAction}>
                <input type="hidden" name="agentId" value={agentId} />
                <input type="hidden" name="id" value={k.id} />
                <SubmitButton pending="Revoking" quiet>
                  Revoke
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="memory-add">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder="What it's for: my research agent"
          aria-label="Key label"
        />
        <button type="submit" className="button quiet" disabled={busy}>
          {busy ? "Making" : "Make a key"}
        </button>
      </form>
    </section>
  );
}
