-- Trust and safety: who did what, hosts refusing owners, and reports.
create table if not exists audit_log (
  id            uuid primary key,
  at            timestamptz not null default now(),
  actor_id      uuid,
  action        text not null,
  subject_kind  text not null,
  subject_id    text not null,
  involved      uuid[] not null default '{}',
  detail        text
);
create index if not exists audit_log_involved_idx on audit_log using gin (involved);
create index if not exists audit_log_at_idx on audit_log (at desc);
alter table audit_log enable row level security;

create table if not exists blocks (
  host_id     uuid not null,
  owner_id    uuid not null,
  created_at  timestamptz not null default now(),
  primary key (host_id, owner_id)
);
alter table blocks enable row level security;

create table if not exists reports (
  id                uuid primary key,
  reporter_id       uuid not null,
  manifestation_id  uuid references manifestations (id) on delete set null,
  agent_id          uuid references agents (id) on delete set null,
  reason            text not null,
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz
);
alter table reports enable row level security;

notify pgrst, 'reload schema';
