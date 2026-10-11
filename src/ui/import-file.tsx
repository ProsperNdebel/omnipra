"use client";

import { useState } from "react";

/** Upload a JSON file of events to /api/events/import. */
export function ImportFile() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/events/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await file.text(),
      });
      const out = await res.json().catch(() => ({}));
      setMsg(
        res.ok
          ? `Imported: ${out.added} new, ${out.updated} updated.`
          : (out.message ?? "That didn't work. Check the file."),
      );
    } catch {
      setMsg("No connection. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <label className="field">
        <span>Events file (.json)</span>
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      {busy && <p className="muted">Importing</p>}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
