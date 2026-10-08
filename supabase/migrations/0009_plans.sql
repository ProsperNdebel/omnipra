-- The agent's plan for an event, and which plan item each note advances.
alter table missions add column plan jsonb;
alter table observations add column plan_item text;

notify pgrst, 'reload schema';
