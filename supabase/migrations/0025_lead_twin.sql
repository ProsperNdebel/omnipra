-- Early access: whether they want help creating their AI twin.
alter table leads add column if not exists twin text not null default 'maybe';

notify pgrst, 'reload schema';
