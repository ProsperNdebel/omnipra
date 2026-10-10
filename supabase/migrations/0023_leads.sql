-- Early access list: people interested in Omnipra who aren't using it yet.
create table if not exists leads (
  id          uuid primary key,
  email       text not null unique,
  first_name  text not null,
  last_name   text not null,
  intent      text not null,
  note        text not null default '',
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists leads_created_at_idx on leads (created_at desc);
alter table leads enable row level security;

notify pgrst, 'reload schema';
