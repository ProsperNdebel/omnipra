-- What the agent does for its owner, with their approval, and the record of how it went.
create table if not exists agent_actions (
  id          uuid primary key,
  agent_id    uuid not null references agents (id) on delete cascade,
  kind        text not null check (kind in ('email', 'event', 'contact', 'task', 'note')),
  payload     jsonb not null,
  why         text not null default '',
  evidence    uuid[] not null default '{}',
  origin      jsonb not null,
  status      text not null check (status in ('proposed', 'active', 'done', 'dismissed')),
  how         text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists agent_actions_agent_idx on agent_actions (agent_id, created_at);
alter table agent_actions enable row level security;

-- Suggestions can now offer to save a contact or add a to do.
alter table agent_suggestions drop constraint if exists agent_suggestions_offer_check;
alter table agent_suggestions
  add constraint agent_suggestions_offer_check
  check (offer in ('intro', 'message', 'contact', 'task', 'watch'));

notify pgrst, 'reload schema';
