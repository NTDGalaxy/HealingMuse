begin;
-- Only the named human-review release workflow publishes recordings. API roles may still edit
-- drafts and the metadata of recordings that are already published, but cannot move a recording
-- into 'published' directly. publish_catalogue_release() is security definer, so it runs as its
-- owner, and service-role and owner maintenance stay allowed.
-- This function is deliberately security invoker: current_user must be the calling API role.
create function public.enforce_publish_lock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if NEW.status = 'published' and current_user in ('authenticated','anon')
    and (TG_OP = 'INSERT' or OLD.status is distinct from 'published') then
    -- An upsert (insert ... on conflict do update) fires this trigger as an INSERT before the
    -- conflict is found. Editing an already-published row that way continues as an UPDATE,
    -- which this trigger checks again, and a plain insert of an existing id fails uniquely.
    -- The row lock keeps that published row from being deleted before the conflict is found,
    -- which would otherwise turn the upsert into a new direct publication. The conflict update
    -- takes the same row lock next, so this adds no new lock ordering.
    if TG_OP = 'INSERT' then
      perform 1 from public.tracks where id = NEW.id and status = 'published' for update;
      if found then return NEW; end if;
    end if;
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_publish_lock() from public, anon, authenticated, service_role;
create trigger enforce_publish_lock before insert or update on public.tracks
for each row execute function public.enforce_publish_lock();
commit;
