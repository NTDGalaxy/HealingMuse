begin;
-- Personal-data invalidation fires once per statement instead of once per changed row, so a
-- 100-item playlist save sends one message per (owner, table) and statement instead of 2N+1.
-- Payload, event, topic and the private flag are identical to notify_personal_change(), which
-- stays in place unused so the previous application version keeps a valid rollback target.
-- PostgreSQL forbids transition tables on multi-event triggers, hence one trigger per event.
create function public.notify_personal_change_statement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owners uuid[]; owner_uuid uuid;
begin
  -- Auth deletion can run under supabase_auth_admin, without realtime grants.
  -- Authenticated clients are the only source of app mutations needing a broadcast.
  if auth.uid() is null then return null; end if;
  if TG_TABLE_NAME = 'profiles' then
    if TG_OP = 'DELETE' then select array_agg(distinct id) into owners from old_rows;
    else select array_agg(distinct id) into owners from new_rows; end if;
  elsif TG_OP = 'DELETE' then select array_agg(distinct owner_id) into owners from old_rows;
  else select array_agg(distinct owner_id) into owners from new_rows;
  end if;
  foreach owner_uuid in array coalesce(owners, '{}') loop
    perform realtime.send(jsonb_build_object('scope', TG_TABLE_NAME), 'invalidate', 'user:' || owner_uuid::text, true);
  end loop;
  return null;
end;
$$;
revoke all on function public.notify_personal_change_statement() from public, anon, authenticated, service_role;
do $$ declare tab text; begin
  foreach tab in array array['profiles','favorites','playlists','playlist_items','mood_checkins'] loop
    execute format('drop trigger notify_personal_change on public.%I', tab);
    execute format('create trigger notify_personal_change_insert after insert on public.%I referencing new table as new_rows for each statement execute function public.notify_personal_change_statement()', tab);
    execute format('create trigger notify_personal_change_update after update on public.%I referencing new table as new_rows for each statement execute function public.notify_personal_change_statement()', tab);
    execute format('create trigger notify_personal_change_delete after delete on public.%I referencing old table as old_rows for each statement execute function public.notify_personal_change_statement()', tab);
  end loop;
end $$;
commit;
