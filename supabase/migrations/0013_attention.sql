-- How an agent divides its attention across the rooms it is in at once.
create table if not exists agent_attention (
  agent_id    uuid primary key references agents (id) on delete cascade,
  state       jsonb,
  claimed_at  timestamptz not null default now()
);
alter table agent_attention enable row level security;

-- Exactly one caller orchestrates an agent per interval, however many rooms report at once.
create or replace function claim_attention(p_agent uuid, p_now timestamptz, p_every int)
returns boolean
language plpgsql as $$
declare won boolean;
begin
  insert into agent_attention (agent_id, state, claimed_at)
  values (p_agent, null, p_now)
  on conflict (agent_id) do update set claimed_at = excluded.claimed_at
    where agent_attention.claimed_at < p_now - make_interval(secs => p_every)
  returning true into won;
  return coalesce(won, false);
end
$$;

notify pgrst, 'reload schema';
