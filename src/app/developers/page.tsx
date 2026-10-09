import type { Metadata } from "next";

export const metadata: Metadata = { title: "Omnipra for agents" };

/** The open manifestation layer: how any AI agent enters the physical world through Omnipra. */
export default function Developers() {
  return (
    <main className="page">
      <div className="narrow">
        <h1 className="title">Omnipra for any agent</h1>
        <p>
          Any AI agent can go to a real event through Omnipra. You ask for an
          event; Omnipra finds a person there whose phone carries your agent,
          captures what is said with their consent, and gives your agent the
          room as it happens. Your agent can ask that person to do things in the
          room.
        </p>

        <h2 className="section">Keys</h2>
        <p>
          Make a key on your agent&rsquo;s page, under Outside agents. A key
          acts as that one Omnipra agent, with its owner&rsquo;s rights over it
          and nothing else. Send it on every call:
        </p>
        <Code>{`Authorization: Bearer omni_...`}</Code>

        <h2 className="section">1. See what&rsquo;s on</h2>
        <Code>{`curl https://YOUR_HOST/api/v1/events?days=7 \\
  -H "Authorization: Bearer $OMNIPRA_KEY"`}</Code>
        <p className="small muted">
          Each event lists its hosts, their price, and what they can do:{" "}
          <code>audio</code> (it hears), <code>vision</code> (it sees),{" "}
          <code>speech</code> (it can talk in the room) and{" "}
          <code>host_requests</code> (the host will do small things when asked).
        </p>

        <h2 className="section">2. Go there</h2>
        <Code>{`curl -X POST https://YOUR_HOST/api/v1/manifestations \\
  -H "Authorization: Bearer $OMNIPRA_KEY" \\
  -H "content-type: application/json" \\
  -d '{
    "event_id": "...",
    "instructions": "Listen for teams building multilingual voice products.",
    "capabilities": ["audio", "host_requests"],
    "budget_cents": 4000
  }'`}</Code>
        <p className="small muted">
          Leave out <code>host_id</code> and Omnipra picks the cheapest host
          with every capability you asked for, within budget. The host still has
          to accept. A plan is drafted from the agent&rsquo;s goals in the
          background.
        </p>

        <h2 className="section">3. Follow the room</h2>
        <Code>{`curl "https://YOUR_HOST/api/v1/manifestations/ID/stream?after_sec=0&since=1970-01-01T00:00:00Z" \\
  -H "Authorization: Bearer $OMNIPRA_KEY"`}</Code>
        <p className="small muted">
          Returns everything new: raw <code>transcript</code> lines,
          Omnipra&rsquo;s <code>notes</code> (each marked claim, corroborated
          or inference, with the lines it rests on), <code>messages</code>, host{" "}
          <code>requests</code> and their answers, and the <code>briefing</code>{" "}
          once it&rsquo;s written. Pass back the <code>cursor</code> you get to
          receive only what&rsquo;s new. Poll every few seconds while the status
          is <code>live</code>.
        </p>

        <h2 className="section">4. Act through the host</h2>
        <Code>{`curl -X POST https://YOUR_HOST/api/v1/manifestations/ID/requests \\
  -H "Authorization: Bearer $OMNIPRA_KEY" \\
  -H "content-type: application/json" \\
  -d '{ "ask": "Could you ask which African languages their API supports?" }'`}</Code>
        <p className="small muted">
          It goes straight to the host&rsquo;s screen. Their answer comes back
          in the stream, and becomes a note.
        </p>

        <h2 className="section">Bodies beyond phones</h2>
        <p>
          A phone is only the first kind of body. Glasses, earbuds, a room
          microphone, a robot or a car can carry agents too. A host adds a
          device under Hosting, Your devices, says what it can do (hear, see,
          speak, knows where it is), and gets a device token. Agents that need{" "}
          <code>vision</code> only go to bodies that can see.
        </p>
        <Code>{`GET  /api/v1/device/sessions              what this device is booked to carry
POST /api/v1/device/sessions/ID/accept
POST /api/v1/device/sessions/ID/start     { "capture_confirmed": true }
POST /api/v1/device/sessions/ID/audio     raw audio, x-run-id, x-seq, x-offset-sec
POST /api/v1/device/sessions/ID/frames    raw image, x-caption optional
POST /api/v1/device/sessions/ID/end

Authorization: Bearer dev_...`}</Code>
        <p className="small muted">
          Send audio as short self-contained files (10 seconds works well), each
          with the next <code>x-seq</code>. Send images whenever the device sees
          something worth reading: a slide, a whiteboard, a badge. The agent
          reads them and its notes cite the image. A reference device lives in{" "}
          <code>scripts/omnipra-device.mjs</code>.
        </p>

        <h2 className="section">Also</h2>
        <p>
          <code>GET /api/v1/manifestations/ID</code> returns status, event, host
          and plan. Errors are JSON <code>{`{ error, message }`}</code> with the
          usual status codes: 401 for a bad key, 404 for something that
          isn&rsquo;t yours, 409 when something changed underneath you.
        </p>
        <h2 className="section">The rules</h2>
        <p>
          Capture happens only where the event allows it and after the host
          confirms the people around them know. Hosts never see why your agent
          wants something. Everything your agent learns stays with its owner.
        </p>
      </div>
    </main>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      style={{
        border: "1px solid var(--rule)",
        padding: 14,
        overflowX: "auto",
        fontSize: "var(--t-sm)",
        marginTop: 12,
      }}
    >
      <code>{children}</code>
    </pre>
  );
}
