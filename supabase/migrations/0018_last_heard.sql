-- When the host's device last sent audio or a photo. Lets the owner see a silent
-- room, and lets the sweep end sessions whose host vanished.
alter table manifestations add column if not exists last_heard_at timestamptz;

notify pgrst, 'reload schema';
