-- When in the session each note was said, from the transcript it cites.
-- Run once after 0002. Existing notes stay null and fall back to processing time.
alter table observations add column at_sec double precision;

notify pgrst, 'reload schema';
