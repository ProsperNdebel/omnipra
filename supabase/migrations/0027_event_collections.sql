-- Event grouping is part of the event itself, not an artifact of how it was imported.
-- Null means the event appears under Miscellaneous.
alter table events add column if not exists collection text;

-- Preserve the Tech Week grouping for events already imported before this field existed.
with tech_week as (
  select
    id,
    lower(substring(source_url from '/calendar/([^/]+)')) as city
  from events
  where collection is null
    and source_url like '%tech-week.com/calendar/%'
)
update events e
set collection = case tech_week.city
  when 'la' then 'LA Tech Week'
  when 'sf' then 'SF Tech Week'
  when 'nyc' then 'NYC Tech Week'
  else initcap(replace(tech_week.city, '-', ' ')) || ' Tech Week'
end
from tech_week
where e.id = tech_week.id;

notify pgrst, 'reload schema';
