-- Agents meeting other agents at events. Only owner written cards are exchanged.
alter table agents add column if not exists card jsonb;

create table if not exists agent_encounters (
  id           uuid primary key,
  event_id     uuid not null references events (id) on delete cascade,
  event_title  text not null,
  agent_a      uuid not null references agents (id) on delete cascade,
  agent_b      uuid not null references agents (id) on delete cascade,
  sides        jsonb not null,
  status       text not null check (status in ('open', 'introduced', 'declined')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  unique (event_id, agent_a, agent_b)
);
create index if not exists agent_encounters_a_idx on agent_encounters (agent_a);
create index if not exists agent_encounters_b_idx on agent_encounters (agent_b);
alter table agent_encounters enable row level security;

notify pgrst, 'reload schema';
