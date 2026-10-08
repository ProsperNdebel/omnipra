-- The agent proposing where it should be, within a budget, for the owner to approve.
create table if not exists agent_outings (
  id                 uuid primary key,
  agent_id           uuid not null references agents (id) on delete cascade,
  request            text not null,
  budget_cents       integer not null check (budget_cents >= 0),
  window_from        timestamptz not null,
  window_to          timestamptz not null,
  picks              jsonb not null default '[]',
  skipped            jsonb not null default '[]',
  status             text not null check (status in ('proposed', 'booked', 'dismissed')),
  manifestation_ids  uuid[] not null default '{}',
  created_at         timestamptz not null default now(),
  decided_at         timestamptz
);
create index if not exists agent_outings_agent_idx on agent_outings (agent_id, created_at);
alter table agent_outings enable row level security;

notify pgrst, 'reload schema';
