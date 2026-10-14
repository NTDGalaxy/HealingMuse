begin;
-- A minimal deletion ledger lets an isolated restore reapply account erasures.
-- It stores no email, mood value, playlist, token, or recording URL.
create table public.deleted_accounts (user_id uuid primary key, deleted_at timestamptz not null default now());
alter table public.deleted_accounts enable row level security;
revoke all on public.deleted_accounts from anon, authenticated;
grant select on public.deleted_accounts to service_role;
create function public.record_account_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.deleted_accounts(user_id) values(old.id) on conflict(user_id) do update set deleted_at=now();
  return old;
end;
$$;
revoke all on function public.record_account_deletion() from public;
create trigger record_account_deletion after delete on auth.users for each row execute function public.record_account_deletion();
select cron.schedule('healingmuse-deletion-ledger-retention','27 18 * * *', $$delete from public.deleted_accounts where deleted_at < now() - interval '90 days';$$);
commit;
