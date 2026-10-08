-- How far each note can be trusted, and who it came from.
-- Notes written before this are marked as claims: the honest default for something heard.
alter table observations
  add column basis text not null default 'claim'
    check (basis in ('claim', 'corroborated', 'inference')),
  add column speaker text;

notify pgrst, 'reload schema';
