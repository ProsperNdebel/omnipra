-- Who the agent is, and what it remembers, kept apart by how far each thing is trusted.
alter table agents add column style text not null default '';

create table agent_memories (
  id          uuid primary key,
  agent_id    uuid not null references agents (id) on delete cascade,
  kind        text not null check (kind in ('identity', 'owner', 'goal', 'experience')),
  text        text not null,
  status      text not null check (status in ('active', 'proposed')),
  -- {"type":"owner"} | {"type":"said",...} | {"type":"heard","manifestationId":...,"observationIds":[...]}
  source      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- The trust rule, enforced in the database too: what was heard can only be an experience.
  constraint heard_is_experience check (source->>'type' <> 'heard' or kind = 'experience')
);
create index agent_memories_agent_idx on agent_memories (agent_id, created_at);
alter table agent_memories enable row level security;

notify pgrst, 'reload schema';
