# Omnipra

Send your agent where you can't be. A person owns a persistent agent; people already at an event let that agent manifest through their phone; what it observes becomes the agent's memory.

## Layout

```
src/
  core/       domain types, manifestation state machine, ports. No framework or vendor imports.
  capture/    browser capture: mic, standalone chunks, IndexedDB outbox, uploader. No imports from the app.
  adapters/   implementations of core ports
    asr/deepgram.ts          TranscriptionProvider
    agent/claude/            AgentProvider (prompts.ts holds all prompt text)
    store/supabase/          Repos + BlobStore (Storage bucket "audio") + Memory (full text recall)
    store/in-memory.ts       same ports in process memory; used when Supabase env is missing
  pipeline/   ingest, observe, brief, ask, lifecycle. Built only on ports.
  server/     deps.ts picks adapters (the only place that does); http.ts maps domain errors to status codes
  services/   use cases for screens: marketplace, agents, missions, access rules, read models
  client/     browser glue: HttpChunkTransport connects capture to the ingest route
  app/        Next pages, server actions and API routes. Thin: parse input, call a service, render.
  ui/         styles.css (tokens), format helpers, and the few client components
```

## Screens

```
/                         this week's events as a schedule
/events/new               add an event and its recording policy
/events/:id               hosts for an event; "I'm attending" to become one
/agent/new                make your agent (once)
/send/:event/:host        the mission for this event; sends a request to the host
/host                     requests to accept or decline
/host/:id                 the phone in the room: start, live clock, end
/m/:id                    the owner's live view, then the briefing
/agent                    your agent, its sessions, and Ask
```

Identity is an anonymous cookie per browser until real sign in lands, so a host lists
themselves and runs the session from the same phone browser. To test alone: list yourself
as a host on an event, then use "Send my own agent through me".

## API

```
POST /api/manifestations/:id/chunks          raw audio body; headers x-run-id, x-seq, x-offset-sec
POST /api/manifestations/:id/{accept|decline|cancel|start|end}
GET  /api/manifestations/:id/feed            owner: observations + briefing; host: counts only
POST /api/agents/:id/ask                     { "question": "..." }
```

Status codes are part of the capture contract: 4xx means drop the chunk, 5xx, 429 and 425 mean retry.

## The loop

1. Host page records 20 second standalone chunks, stores each in IndexedDB, uploads oldest first.
2. Ingest stores the blob and transcribes it. Idempotent: ids derive from (manifestation, run, seq).
3. After the response, observe runs. Once 45 seconds of new transcript exist, one caller claims the window
   by compare and set on `observedThroughSec`, Claude records typed observations, and any observation
   not citing transcript it was shown is dropped.
4. On end, brief processes the tail and writes the briefing.
5. Ask recalls the agent's observations across all manifestations and answers only from them.

Rules: `core` imports nothing outside itself. `capture` imports nothing outside itself. Only `adapters` import vendor SDKs.

## Run

```
npm install
cp .env.example .env.local     # fill in all five values
npm run typecheck
npm run dev
```

Database: paste each file in `supabase/migrations/` into the Supabase SQL editor, in order, once each.
It creates the tables, the recall function, and a private `audio` storage bucket. RLS is on with no
policies, so only the server (secret key) can read or write.
