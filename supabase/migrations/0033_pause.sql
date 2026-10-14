-- The host can pause listening (mic off) and resume, without ending the session.
alter table manifestations add column if not exists paused_at timestamptz;

notify pgrst, 'reload schema';
