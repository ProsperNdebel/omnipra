"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { disconnectDeviceAction } from "@/app/actions";
import { fmtDay } from "./format";
import { SubmitButton } from "./submit-button";

const KINDS: [string, string][] = [
  ["glasses", "Smart glasses"],
  ["earbuds", "Earbuds"],
  ["room", "Room device (a mic or camera on a table)"],
  ["robot", "Robot"],
  ["vehicle", "Vehicle"],
  ["other", "Something else"],
];
const CAPS: [string, string][] = [
  ["mic", "Hears"],
  ["camera", "Sees"],
  ["speaker", "Can speak"],
  ["location", "Knows where it is"],
];

/**
 * The bodies a host offers agents. Their phone is always one; anything else that can
 * call the device API can be another. A device's token is shown once.
 */
export function DevicesPanel({
  devices,
}: {
  devices: {
    id: string;
    name: string;
    kind: string;
    capabilities: string[];
    lastSeenAt: string | null;
  }[];
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        kind: f.get("kind"),
        capabilities: f.getAll("capabilities"),
      }),
    }).catch(() => null);
    const out = await res?.json().catch(() => null);
    if (res?.ok) {
      setToken(out.token);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } else setError(out?.message ?? "That didn't work. Try again.");
    setBusy(false);
  }

  return (
    <section id="devices">
      <h2 className="section">Your devices</h2>
      <p className="muted small">
        Anything that can hear or see can carry an agent: glasses, a room mic, a
        robot. Your phone is always one. Pick which device carries agents when
        you list yourself at an event.
      </p>

      {token && (
        <div
          style={{ marginTop: 16, padding: 16, border: "1px solid var(--ink)" }}
        >
          <div className="small muted">
            The device&rsquo;s token. Put it on the device now; it won&rsquo;t
            be shown again.
          </div>
          <code
            style={{ display: "block", marginTop: 8, wordBreak: "break-all" }}
          >
            {token}
          </code>
          <div className="actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button quiet"
              onClick={() => setToken(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <ul className="rows">
        {devices.map((d) => (
          <li key={d.id}>
            <div>
              <div>{d.name}</div>
              <div className="small muted">
                {d.kind === "phone_web" ? "Phone, through this site" : d.kind},{" "}
                {d.capabilities.join(", ")}
                {d.kind !== "phone_web" &&
                  (d.lastSeenAt
                    ? `, last seen ${fmtDay(d.lastSeenAt)}`
                    : ", not connected yet")}
              </div>
            </div>
            {d.kind !== "phone_web" && (
              <form action={disconnectDeviceAction}>
                <input type="hidden" name="id" value={d.id} />
                <SubmitButton pending="Disconnecting" quiet>
                  Disconnect
                </SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>

      <details className="change">
        <summary className="linkish small">Add a device</summary>
        <form onSubmit={add} className="stack" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              placeholder="Table mic"
            />
          </label>
          <label className="field">
            <span>What it is</span>
            <select name="kind" defaultValue="room">
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <fieldset
            className="field"
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <span>What it can do</span>
            <div className="checks">
              {CAPS.map(([v, l]) => (
                <label key={v}>
                  <input
                    type="checkbox"
                    name="capabilities"
                    value={v}
                    defaultChecked={v === "mic"}
                  />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="button" disabled={busy}>
              {busy ? "Adding" : "Add device"}
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
