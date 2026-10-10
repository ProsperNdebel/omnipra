-- Early access: whether they want us to build their Entwin (their AI twin).
alter table leads add column if not exists twin text not null default 'maybe';

notify pgrst, 'reload schema';
