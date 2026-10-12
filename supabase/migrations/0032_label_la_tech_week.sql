-- Group LA Tech Week events under a named collection instead of Miscellaneous.
update events
set collection = 'L.A Tech Week'
where source_url like 'https://www.tech-week.com/calendar/la/events/%'
  and (collection is null or btrim(collection) = '');

notify pgrst, 'reload schema';
