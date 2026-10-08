-- Run once after 0003.

-- Which notes back each briefing point and follow up: {"headline": [[ids]], "followUps": [[ids]]}.
alter table briefings
  add column cites jsonb not null default '{"headline": [], "followUps": []}';

-- When the host confirmed recording was allowed. Required to start a session from now on.
alter table manifestations add column capture_confirmed_at timestamptz;

notify pgrst, 'reload schema';
