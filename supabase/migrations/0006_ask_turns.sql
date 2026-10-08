-- The owner's running conversation with their agent, so follow up questions have context.
create table ask_turns (
  id          uuid primary key,
  agent_id    uuid not null references agents (id) on delete cascade,
  question    text not null,
  answer      text not null,
  based_on    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index ask_turns_agent_idx on ask_turns (agent_id, created_at);
alter table ask_turns enable row level security;

notify pgrst, 'reload schema';
