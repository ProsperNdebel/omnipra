// Download every audio chunk of one session from Supabase Storage.
//
//   node --env-file=.env.local scripts/download-audio.mjs <session id> [out dir]
//
// Saves chunks as <out>/<recording>/<seq>.webm|.m4a in recording order and,
// when ffmpeg is installed, joins each recording into <out>/<recording>.m4a.
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from the env.

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUCKET = "audio";
const [sessionId, outArg] = process.argv.slice(2);
if (!sessionId) {
  console.error("usage: node --env-file=.env.local scripts/download-audio.mjs <session id> [out dir]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}
const out = outArg ?? join("audio", sessionId);
const db = createClient(url, key, { auth: { persistSession: false } });

async function list(prefix) {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

const extFor = (mime = "") => (mime.includes("mp4") ? "m4a" : "webm");

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const recordings = (await list(sessionId)).filter((e) => !e.metadata);
if (recordings.length === 0) {
  console.error(`No recordings under ${BUCKET}/${sessionId}`);
  process.exit(1);
}

const ffmpeg = hasFfmpeg();
let total = 0;
for (const rec of recordings) {
  const dir = join(out, rec.name);
  mkdirSync(dir, { recursive: true });
  const chunks = (await list(`${sessionId}/${rec.name}`)).filter((e) => e.metadata);
  const files = [];
  for (const c of chunks) {
    const path = `${sessionId}/${rec.name}/${c.name}`;
    const { data, error } = await db.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(`download ${path}: ${error?.message ?? "no data"}`);
    const file = join(dir, `${c.name}.${extFor(c.metadata.mimetype)}`);
    writeFileSync(file, Buffer.from(await data.arrayBuffer()));
    files.push(file);
  }
  total += files.length;
  console.log(`${rec.name}: ${files.length} chunks`);

  if (ffmpeg && files.length > 0) {
    const listFile = join(dir, "list.txt");
    writeFileSync(listFile, files.map((f) => `file '${f.split("/").pop()}'`).join("\n"));
    const merged = join(out, `${rec.name}.m4a`);
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "aac", "-b:a", "96k", merged],
      { stdio: "inherit" },
    );
    console.log(`  joined into ${merged}`);
  }
}
console.log(`${total} chunks saved to ${out}`);
