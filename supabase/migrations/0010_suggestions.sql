-- What the agent suggests its owner do after an event, with the notes behind it.
create table if not exists agent_suggestions (
  id                uuid primary key,
  agent_id          uuid not null references agents (id) on delete cascade,
  manifestation_id  uuid not null references manifestations (id) on delete cascade,
  kind              text not null check (kind in ('connection', 'follow_up', 'question')),
  text              text not null,
  why               text not null default '',
  offer             text check (offer in ('intro', 'message', 'watch')),
  target            text,
  evidence          uuid[] not null,
  status            text not null check (status in ('open', 'accepted', 'dismissed')),
  draft             text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);
create index if not exists agent_suggestions_agent_idx on agent_suggestions (agent_id, created_at);
alter table agent_suggestions enable row level security;

notify pgrst, 'reload schema';
