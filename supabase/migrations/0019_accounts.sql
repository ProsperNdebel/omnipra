-- Signed in accounts (Supabase Auth) mapped to Omnipra users. Everything else keeps
-- its plain user ids, so a guest's agents and listings carry over on first sign in.
create table if not exists accounts (
  auth_user_id  uuid primary key,
  user_id       uuid not null unique,
  email         text,
  created_at    timestamptz not null default now()
);
alter table accounts enable row level security;

notify pgrst, 'reload schema';
