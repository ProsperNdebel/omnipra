-- Early access: an optional phone number, and whether they're up for a chat.
alter table leads add column if not exists phone text not null default '';
alter table leads add column if not exists chat text not null default 'maybe';

notify pgrst, 'reload schema';
