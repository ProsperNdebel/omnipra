-- The host can say "I'll ask" before answering, and what they report back becomes a note.
alter table host_requests drop constraint if exists host_requests_status_check;
alter table host_requests
  add constraint host_requests_status_check
  check (status in ('proposed', 'dismissed', 'sent', 'accepted', 'done', 'declined'));

alter table observations
  add column if not exists host_request_id uuid references host_requests (id) on delete set null;

notify pgrst, 'reload schema';
