-- Presence: initial schema.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Access model for the MVP: RLS is enabled on every table with no policies, so the
-- publishable key can read and write nothing. All access goes through our server
-- with the secret key. Policies get added when real auth lands.
--
-- owner_id / host_id are plain uuids for now; they become references to auth.users
-- once sign in exists.

create extension if not exists pgcrypto;

-- Agents ---------------------------------------------------------------------

create table agents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  name        text not null check (length(name) between 1 and 60),
  profile     text not null default '',
  look_for    text[] not null default '{}',
  provider    text not null default 'native',
  created_at  timestamptz not null default now()
);
create index agents_owner_idx on agents (owner_id);

-- Events and supply ----------------------------------------------------------

create table events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  venue           text,
  source_url      text,
  capture_policy  text not null default 'none' check (capture_policy in ('organizer', 'public_talk', 'none')),
  check (ends_at > starts_at)
);
create index events_time_idx on events (starts_at, ends_at);

create table endpoints (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null,
  kind          text not null check (kind in ('phone_web')),
  capabilities  text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table host_listings (
  event_id     uuid not null references events (id) on delete cascade,
  host_id      uuid not null,
  endpoint_id  uuid not null references endpoints (id) on delete cascade,
  offers       text[] not null default '{mic}',
  price_cents  integer not null check (price_cents >= 0),
  created_at   timestamptz not null default now(),
  primary key (event_id, host_id)
);

-- Missions and manifestations -----------------------------------------------

create table missions (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agents (id) on delete cascade,
  event_id      uuid not null references events (id) on delete restrict,
  instructions  text not null default '',
  alerts        text[] not null default '{}',
  context       text[] not null default '{memory}',
  requires      text[] not null default '{mic}',
  created_at    timestamptz not null default now()
);
create index missions_agent_idx on missions (agent_id);

create table manifestations (
  id                    uuid primary key default gen_random_uuid(),
  mission_id            uuid not null references missions (id) on delete cascade,
  endpoint_id           uuid not null references endpoints (id) on delete restrict,
  price_cents           integer not null check (price_cents >= 0),
  status                text not null check (status in ('requested', 'accepted', 'declined', 'cancelled', 'live', 'ended', 'briefed')),
  observed_through_sec  double precision not null default 0,
  started_at            timestamptz,
  ended_at              timestamptz,
  created_at            timestamptz not null default now()
);
create index manifestations_mission_idx on manifestations (mission_id);
create index manifestations_status_idx on manifestations (status);

-- What the agent heard and concluded ------------------------------------------

-- id is deterministic (manifestation:run:seq:index) so retried chunks upsert.
create table transcript_segments (
  id                text primary key,
  manifestation_id  uuid not null references manifestations (id) on delete cascade,
  speaker           text,
  text              text not null,
  start_sec         double precision not null,
  end_sec           double precision not null
);
create index transcript_segments_window_idx on transcript_segments (manifestation_id, end_sec);

create table observations (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid not null references agents (id) on delete cascade,
  manifestation_id  uuid not null references manifestations (id) on delete cascade,
  kind              text not null check (kind in ('insight', 'person', 'company', 'opportunity', 'question', 'number')),
  text              text not null,
  importance        smallint not null check (importance between 1 and 3),
  alert             text,
  entities          text[] not null default '{}',
  evidence          text[] not null default '{}',
  created_at        timestamptz not null default now(),
  search            tsvector
);
create index observations_manifestation_idx on observations (manifestation_id, created_at);
create index observations_agent_idx on observations (agent_id, created_at desc);
create index observations_search_idx on observations using gin (search);

-- A trigger rather than a generated column: array_to_string is not immutable,
-- so Postgres won't allow it in a generated column.
create function observations_set_search() returns trigger language plpgsql as $$
begin
  new.search :=
    setweight(to_tsvector('english', array_to_string(new.entities, ' ')), 'A') ||
    setweight(to_tsvector('english', new.text), 'B');
  return new;
end $$;

create trigger observations_search_trg
  before insert or update of text, entities on observations
  for each row execute function observations_set_search();

create table briefings (
  manifestation_id  uuid primary key references manifestations (id) on delete cascade,
  headline          text[] not null default '{}',
  follow_ups        jsonb not null default '[]',
  open_questions    text[] not null default '{}',
  markdown          text not null default '',
  created_at        timestamptz not null default now()
);

-- Recall ---------------------------------------------------------------------

-- Questions are natural language ("what did people say about pricing?"), so terms are
-- OR'd, not AND'd. Rank by match, then importance, then recency. A question with no
-- useful terms ("what did you learn today?") falls through to importance and recency.
create function recall_observations(p_agent uuid, p_query text, p_limit int)
returns setof observations
language sql stable as $$
  with q as (
    select case
      when cardinality(tsvector_to_array(to_tsvector('english', p_query))) = 0 then null
      else to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', p_query)), ' | '))
    end as tsq
  )
  select o.*
  from observations o, q
  where o.agent_id = p_agent
  order by
    coalesce(ts_rank(o.search, q.tsq), 0) desc,
    o.importance desc,
    o.created_at desc
  limit p_limit
$$;

-- Lock everything down -------------------------------------------------------

alter table agents               enable row level security;
alter table events               enable row level security;
alter table endpoints            enable row level security;
alter table host_listings        enable row level security;
alter table missions             enable row level security;
alter table manifestations       enable row level security;
alter table transcript_segments  enable row level security;
alter table observations         enable row level security;
alter table briefings            enable row level security;

-- Audio storage: private bucket, server access only.
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;
