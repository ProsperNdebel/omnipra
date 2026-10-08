-- Bodies beyond phones: any device can carry an agent, and agents can see as well as hear.
alter table endpoints drop constraint if exists endpoints_kind_check;
alter table endpoints
  add constraint endpoints_kind_check
  check (kind in ('phone_web', 'glasses', 'earbuds', 'room', 'robot', 'vehicle', 'other'));
alter table endpoints
  add column if not exists name text not null default 'My phone',
  add column if not exists token_hash text unique,
  add column if not exists last_seen_at timestamptz;

-- Phones have cameras.
update endpoints set capabilities = array_append(capabilities, 'camera')
  where kind = 'phone_web' and not ('camera' = any (capabilities));

create table if not exists frames (
  id                uuid primary key,
  manifestation_id  uuid not null references manifestations (id) on delete cascade,
  blob_key          text not null,
  mime_type         text not null,
  at_sec            double precision,
  caption           text,
  created_at        timestamptz not null default now()
);
create index if not exists frames_session_idx on frames (manifestation_id, created_at);
alter table frames enable row level security;

alter table observations add column if not exists frames uuid[] not null default '{}';

notify pgrst, 'reload schema';
