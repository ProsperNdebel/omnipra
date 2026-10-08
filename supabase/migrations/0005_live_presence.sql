-- Live presence: the agent talks to its owner during a session and can act through its host.
-- Run once after 0004.

-- Hosts opt in to small in-room requests (like asking a speaker a question).
alter table host_listings add column open_to_requests boolean not null default false;

-- Per session: may the agent's asks go straight to the host, and what the owner told it mid-session.
alter table missions
  add column autonomy text not null default 'ask_first' check (autonomy in ('ask_first', 'act')),
  add column orders text[] not null default '{}';

-- The conversation around a live session: nudges, chat, status updates.
create table agent_messages (
  id                uuid primary key,
  manifestation_id  uuid not null references manifestations (id) on delete cascade,
  agent_id          uuid not null references agents (id) on delete cascade,
  sender            text not null check (sender in ('agent', 'owner', 'host')),
  kind              text not null check (kind in ('nudge', 'chat', 'update')),
  text              text not null,
  at_sec            double precision,
  created_at        timestamptz not null default now()
);
create index agent_messages_session_idx on agent_messages (manifestation_id, created_at);

-- Things the agent wants done in the room.
create table host_requests (
  id                uuid primary key,
  manifestation_id  uuid not null references manifestations (id) on delete cascade,
  agent_id          uuid not null references agents (id) on delete cascade,
  ask               text not null,
  why               text not null default '',
  origin            text not null check (origin in ('agent', 'owner')),
  status            text not null check (status in ('proposed', 'dismissed', 'sent', 'done', 'declined')),
  host_note         text,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  resolved_at       timestamptz
);
create index host_requests_session_idx on host_requests (manifestation_id, created_at);

alter table agent_messages enable row level security;
alter table host_requests  enable row level security;

notify pgrst, 'reload schema';
