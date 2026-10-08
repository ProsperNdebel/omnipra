#!/usr/bin/env node
/**
 * A reference Presence body: anything that can run this (a Raspberry Pi with a mic, a
 * laptop on a table, a companion app for glasses) can carry agents.
 *
 *   PRESENCE_URL=https://your-presence DEVICE_TOKEN=dev_... \
 *     node scripts/presence-device.mjs --confirm --audio talk.webm --image slide.jpg
 *
 * It accepts the next session booked on this device, starts it (--confirm means you
 * confirm recording is allowed where the device is and people nearby know), sends
 * the audio and the image, then ends the session so the briefing gets written.
 *
 * A real device records continuously and sends short self-contained audio files
 * (each one decodable on its own, 10 seconds is good) with increasing x-seq and the
 * x-offset-sec where each starts. Images go to /frames whenever it sees something.
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const BASE = process.env.PRESENCE_URL ?? "http://localhost:3000";
const TOKEN = process.env.DEVICE_TOKEN;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args[args.indexOf(`--${name}`) + 1];
if (!TOKEN) throw new Error("Set DEVICE_TOKEN (from Hosting, Your devices).");

const TYPES = {
  ".webm": "audio/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const typeOf = (path) =>
  TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";

async function call(path, init = {}) {
  const res = await fetch(`${BASE}/api/v1/device${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body?.message ?? ""}`);
  return body;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { device } = await call("/sessions");
console.log(
  `This is ${device.name} (${device.kind}): ${device.capabilities.join(", ")}`,
);

let session;
while (!session) {
  const { sessions } = await call("/sessions");
  session = sessions.find((s) => s.status !== "live") ?? sessions[0];
  if (!session) {
    console.log("Nothing booked on this device yet. Waiting.");
    await sleep(5000);
  }
}
console.log(`Carrying ${session.agent} at ${session.event.title}`);

const post = (action, body) =>
  call(`/sessions/${session.id}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
if (session.status === "requested") await post("accept");
if (session.status !== "live") {
  if (!flag("confirm"))
    throw new Error(
      "Pass --confirm to confirm recording is allowed here and people nearby know.",
    );
  await post("start", { capture_confirmed: true });
}
console.log("Live.");

if (opt("audio")) {
  const path = opt("audio");
  const out = await call(`/sessions/${session.id}/audio`, {
    method: "POST",
    headers: {
      "content-type": typeOf(path),
      "x-run-id": `run-${Date.now()}`,
      "x-seq": "0",
      "x-offset-sec": "0",
    },
    body: await readFile(path),
  });
  console.log(`Sent audio: ${out.segments} transcript lines.`);
}
if (opt("image")) {
  const path = opt("image");
  const out = await call(`/sessions/${session.id}/frames`, {
    method: "POST",
    headers: {
      "content-type": typeOf(path),
      ...(opt("caption") ? { "x-caption": opt("caption") } : {}),
    },
    body: await readFile(path),
  });
  console.log(`Sent image. ${session.agent} noted:`);
  for (const n of out.notes) console.log(`  - ${n.text}`);
}

if (!flag("stay")) {
  await sleep(3000);
  await post("end");
  console.log("Ended. The briefing is on its way to the agent's owner.");
}
