-- Background work that survives the request that started it, with retries.
create table if not exists jobs (
  id            uuid primary key,
  kind          text not null,
  key           text not null,
  payload       jsonb not null default '{}',
  status        text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  run_at        timestamptz not null default now(),
  locked_until  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
-- At most one live job per key: enqueueing the same work twice is harmless.
create unique index if not exists jobs_live_key on jobs (key) where status in ('queued', 'running');
create index if not exists jobs_due_idx on jobs (run_at) where status in ('queued', 'running');
alter table jobs enable row level security;

-- Take due jobs atomically. Several workers can run this at once; each job goes to one.
create or replace function claim_jobs(p_now timestamptz, p_limit int, p_lease timestamptz, p_id uuid default null)
returns setof jobs
language sql
as $$
  update jobs
     set status = 'running', locked_until = p_lease, attempts = attempts + 1
   where id in (
     select id from jobs
      where ((status = 'queued' and run_at <= p_now)
          or (status = 'running' and locked_until < p_now))
        and (p_id is null or id = p_id)
      order by run_at
      limit p_limit
      for update skip locked
   )
  returning *;
$$;

-- Outside agents receive their agent's events here, signed with the secret.
alter table api_keys add column if not exists webhook_url text;
alter table api_keys add column if not exists webhook_secret text;

notify pgrst, 'reload schema';
