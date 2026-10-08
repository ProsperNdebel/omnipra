-- Keys that let an outside agent act as one Presence agent. Only hashes are stored.
create table if not exists api_keys (
  id            uuid primary key,
  agent_id      uuid not null references agents (id) on delete cascade,
  owner_id      uuid not null,
  label         text not null default '',
  prefix        text not null,
  hash          text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_keys_agent_idx on api_keys (agent_id);
alter table api_keys enable row level security;

notify pgrst, 'reload schema';
