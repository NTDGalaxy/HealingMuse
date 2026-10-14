begin;
-- Existing Supabase projects grant API roles privileges through default ACLs.
-- Restrict only HealingMuse objects, preserving other applications' defaults and objects.
revoke all on table
  public.content_admins, public.profiles, public.tracks,
  public.curated_collections, public.curated_collection_items,
  public.favorites, public.playlists, public.playlist_items,
  public.listening_sessions, public.mood_checkins,
  public.rate_limits, public.deleted_accounts
from anon, authenticated;

grant select on public.tracks, public.curated_collections, public.curated_collection_items to anon, authenticated;
grant insert, update on public.tracks to authenticated;
grant insert, update, delete on public.curated_collections, public.curated_collection_items to authenticated;
grant select on public.profiles to authenticated;
grant update(locale, calm_mode) on public.profiles to authenticated;
grant select, insert, delete on public.favorites, public.playlists to authenticated;
grant select on public.playlist_items to authenticated;
grant select, delete on public.listening_sessions, public.mood_checkins to authenticated;

grant all on table
  public.content_admins, public.profiles, public.tracks,
  public.curated_collections, public.curated_collection_items,
  public.favorites, public.playlists, public.playlist_items,
  public.listening_sessions, public.mood_checkins,
  public.rate_limits, public.deleted_accounts
to service_role;

revoke execute on function
  public.is_content_admin(), public.create_profile(), public.notify_personal_change(),
  public.record_account_deletion(), public.consume_rate_limit(text,text,integer,integer),
  public.save_playlist(uuid,integer,text,uuid[]), public.set_mood_consent(boolean),
  public.start_listening(uuid,integer), public.end_listening(uuid,integer),
  public.save_collection(uuid,integer,jsonb,text,boolean,uuid[])
from public, anon, authenticated;

grant execute on function
  public.is_content_admin(), public.save_playlist(uuid,integer,text,uuid[]),
  public.set_mood_consent(boolean), public.start_listening(uuid,integer),
  public.end_listening(uuid,integer), public.save_collection(uuid,integer,jsonb,text,boolean,uuid[])
to authenticated;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;
commit;
