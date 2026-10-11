-- Open requests: an owner wants their agent at an event before anyone is hosting it.
-- A host who lists for the event can take one, which makes an ordinary booking.
create table if not exists wishes (
  id                uuid primary key,
  owner_id          uuid not null,
  agent_id          uuid not null references agents (id) on delete cascade,
  event_id          uuid not null references events (id) on delete cascade,
  instructions      text not null default '',
  alerts            text[] not null default '{}',
  autonomy          text not null default 'ask_first',
  max_price_cents   integer not null,
  status            text not null default 'open',
  manifestation_id  uuid references manifestations (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists wishes_open_event_idx on wishes (event_id) where status = 'open';
create index if not exists wishes_owner_idx on wishes (owner_id, created_at desc);
alter table wishes enable row level security;

notify pgrst, 'reload schema';
