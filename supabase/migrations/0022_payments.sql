-- Payments through Omnipra (off unless OMNIPRA_PAYMENTS=1). One payment per session:
-- a hold when the agent is sent, charged or released after the session.
create table if not exists payments (
  manifestation_id  uuid primary key references manifestations (id) on delete cascade,
  owner_id          uuid not null,
  host_id           uuid not null,
  amount_cents      int not null,
  fee_cents         int not null,
  currency          text not null default 'usd',
  status            text not null check (status in ('pending', 'authorized', 'captured', 'released', 'failed')),
  checkout_id       text,
  intent_id         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists payments_checkout_idx on payments (checkout_id);
alter table payments enable row level security;

-- Where each host's money goes (their Stripe Connect account).
create table if not exists payout_accounts (
  user_id              uuid primary key,
  provider_account_id  text not null unique,
  ready                boolean not null default false,
  updated_at           timestamptz not null default now()
);
alter table payout_accounts enable row level security;

notify pgrst, 'reload schema';
