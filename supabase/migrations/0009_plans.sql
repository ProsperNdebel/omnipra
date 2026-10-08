-- The agent's plan for an event, and which plan item each note advances.
alter table missions add column if not exists plan jsonb;
alter table observations add column if not exists plan_item text;

notify pgrst, 'reload schema';
