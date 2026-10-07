-- How a host appears to agent owners ("Sarah M."). Run once after 0001.
alter table host_listings
  add column display_name text not null default 'Host'
  check (length(display_name) between 1 and 40);
