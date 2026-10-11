begin;

create table public.content_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.content_admins enable row level security;
revoke all on public.content_admins from anon, authenticated;

create function public.is_content_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.content_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_content_admin() from public;
grant execute on function public.is_content_admin() to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'vi' check (locale in ('vi','en')),
  calm_mode boolean not null default false,
  mood_consent_at timestamptz,
  created_at timestamptz not null default now()
);
create function public.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  return new;
end;
$$;
revoke all on function public.create_profile() from public;
create trigger create_patient_profile after insert on auth.users for each row execute function public.create_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
alter table public.profiles enable row level security;
create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select, update on public.profiles to authenticated;

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null check (length(title->>'vi') between 1 and 160 and length(title->>'en') between 1 and 160),
  description jsonb not null default '{"vi":"","en":""}',
  artist text not null check (length(artist) between 1 and 120),
  category text not null check (category in ('instrumental','nature')),
  goals text[] not null check (cardinality(goals) between 1 and 3 and goals <@ array['relax','rest','focus']::text[]),
  duration integer not null check (duration between 1 and 14400),
  source jsonb not null,
  download_allowed boolean not null default false,
  artwork text not null default 'forest' check (artwork in ('forest','rain','sea','piano','river','night')),
  color text not null default 'sage' check (color in ('sage','sand','blue','lavender','rose')),
  attribution text not null,
  license text not null,
  license_url text not null,
  provenance_url text not null,
  status text not null default 'draft' check (status in ('draft','published','retired')),
  rights_verified boolean not null default false,
  human_created boolean not null default false,
  position integer not null default 0 check (position >= 0),
  bytes bigint check (bytes > 0),
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  changes text not null default '',
  created_at timestamptz not null default now(),
  check (source->>'kind' in ('hosted','youtube','spotify_link')),
  check (not download_allowed or source->>'kind' = 'hosted'),
  check (status <> 'published' or (rights_verified and human_created and length(attribution) > 0 and license_url like 'https://%' and provenance_url like 'https://%')),
  check (case source->>'kind'
    when 'hosted' then source->>'path' ~ '^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.mp3$' and source->>'path' not like '%..%'
    when 'youtube' then source->>'videoId' ~ '^[a-zA-Z0-9_-]{11}$'
    when 'spotify_link' then source->>'url' ~ '^https://open\.spotify\.com/'
    else false end)
);
create index published_track_order on public.tracks(position, id) where status = 'published';
create index track_goals on public.tracks using gin(goals);
alter table public.tracks enable row level security;
create policy catalog_read on public.tracks for select to anon, authenticated using (status = 'published');
create policy admin_catalog_read on public.tracks for select to authenticated using ((select public.is_content_admin()));
create policy admin_catalog_insert on public.tracks for insert to authenticated with check ((select public.is_content_admin()));
create policy admin_catalog_update on public.tracks for update to authenticated using ((select public.is_content_admin())) with check ((select public.is_content_admin()));
grant select on public.tracks to anon, authenticated;
grant insert, update on public.tracks to authenticated;

create table public.curated_collections (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null,
  goal text not null check (goal in ('relax','rest','focus')),
  position integer not null default 0,
  published boolean not null default false
);
create table public.curated_collection_items (
  collection_id uuid not null references public.curated_collections(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key(collection_id, track_id), unique(collection_id, position)
);
alter table public.curated_collections enable row level security;
alter table public.curated_collection_items enable row level security;
create policy collection_read on public.curated_collections for select to anon, authenticated using (published);
create policy collection_admin on public.curated_collections for all to authenticated using ((select public.is_content_admin())) with check ((select public.is_content_admin()));
create policy collection_item_read on public.curated_collection_items for select to anon, authenticated using (
  exists(select 1 from public.curated_collections c where c.id = collection_id and c.published)
  and exists(select 1 from public.tracks t where t.id = track_id and t.status = 'published')
);
create policy collection_item_admin on public.curated_collection_items for all to authenticated using ((select public.is_content_admin())) with check ((select public.is_content_admin()));
grant select on public.curated_collections, public.curated_collection_items to anon, authenticated;
grant insert, update, delete on public.curated_collections, public.curated_collection_items to authenticated;

create table public.favorites (
  owner_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id, track_id)
);
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  unique(id, owner_id)
);
create index playlists_owner on public.playlists(owner_id, created_at desc);
create table public.playlist_items (
  playlist_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  position integer not null check (position between 0 and 99),
  primary key(playlist_id, track_id),
  unique(playlist_id, position),
  foreign key(playlist_id, owner_id) references public.playlists(id, owner_id) on delete cascade
);
create index playlist_items_owner on public.playlist_items(owner_id);
create table public.listening_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique(id, owner_id),
  check (ended_at is null or ended_at >= started_at)
);
create index sessions_owner_date on public.listening_sessions(owner_id, started_at desc);
create table public.mood_checkins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  phase text not null check (phase in ('before','after')),
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  foreign key(session_id, owner_id) references public.listening_sessions(id, owner_id) on delete cascade,
  unique(session_id, phase)
);
create index checkins_owner_date on public.mood_checkins(owner_id, created_at desc);

do $$ declare tab text; begin
  foreach tab in array array['favorites','playlists','playlist_items','listening_sessions','mood_checkins'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()))', tab);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', tab);
    execute format('grant select, delete on public.%I to authenticated', tab);
  end loop;
end $$;
create policy favorite_insert on public.favorites for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists(select 1 from public.tracks where id = track_id and status = 'published')
);
create policy playlist_insert on public.playlists for insert to authenticated with check (owner_id = (select auth.uid()));
grant insert on public.favorites, public.playlists to authenticated;

-- Personal writes are transactional RPCs so clients cannot bypass consent,
-- retention, playlist revisions, or check-in phase ordering.
create function public.save_playlist(p_id uuid, p_revision integer, p_title text, p_tracks uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare current_revision integer;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_revision is null or p_title is null or p_tracks is null
    or length(btrim(p_title)) not between 1 and 80 or cardinality(p_tracks) > 100
    or cardinality(p_tracks) <> (select count(distinct x) from unnest(p_tracks) x)
    then raise exception 'invalid' using errcode = '22023'; end if;
  select revision into current_revision from public.playlists where id = p_id and owner_id = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  if current_revision <> p_revision then raise exception 'conflict' using errcode = '40001'; end if;
  if exists(select 1 from unnest(p_tracks) x where not exists(select 1 from public.tracks t where t.id = x and t.status = 'published'))
    then raise exception 'invalid_track' using errcode = '22023'; end if;
  delete from public.playlist_items where playlist_id = p_id;
  insert into public.playlist_items(playlist_id, owner_id, track_id, position)
    select p_id, auth.uid(), x, ordinality - 1 from unnest(p_tracks) with ordinality as items(x, ordinality);
  update public.playlists set title = btrim(p_title), revision = revision + 1 where id = p_id;
end;
$$;

create function public.set_mood_consent(p_consent boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_consent is null then raise exception 'invalid' using errcode = '22023'; end if;
  update public.profiles set mood_consent_at = case when p_consent then coalesce(mood_consent_at, now()) else null end where id = auth.uid();
  if not p_consent then delete from public.listening_sessions where owner_id = auth.uid(); end if;
end;
$$;
-- Consent must use the explicit RPC, not arbitrary profile updates.
revoke update on public.profiles from authenticated;
grant update(locale, calm_mode) on public.profiles to authenticated;

create function public.start_listening(p_track uuid, p_score integer default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare session_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and mood_consent_at is not null)
    then raise exception 'consent_required' using errcode = '42501'; end if;
  if p_score is not null and p_score not between 1 and 5 then raise exception 'invalid' using errcode = '22023'; end if;
  if not exists(select 1 from public.tracks where id = p_track and status = 'published') then raise exception 'invalid_track' using errcode = '22023'; end if;
  insert into public.listening_sessions(owner_id, track_id) values(auth.uid(), p_track) returning id into session_id;
  if p_score is not null then insert into public.mood_checkins(owner_id, session_id, phase, score) values(auth.uid(), session_id, 'before', p_score); end if;
  return session_id;
end;
$$;
create function public.end_listening(p_session uuid, p_score integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare session_row public.listening_sessions;
begin
  select * into session_row from public.listening_sessions where id = p_session and owner_id = auth.uid() and started_at > now() - interval '90 days' for update;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and mood_consent_at is not null)
    then raise exception 'consent_required' using errcode = '42501'; end if;
  if p_score is not null and p_score not between 1 and 5 then raise exception 'invalid' using errcode = '22023'; end if;
  update public.listening_sessions set ended_at = coalesce(ended_at, now()) where id = p_session;
  if p_score is not null then
    insert into public.mood_checkins(owner_id, session_id, phase, score) values(auth.uid(), p_session, 'after', p_score)
    on conflict(session_id, phase) do nothing;
  end if;
end;
$$;
revoke all on function public.save_playlist(uuid,integer,text,uuid[]), public.set_mood_consent(boolean), public.start_listening(uuid,integer), public.end_listening(uuid,integer) from public;
grant execute on function public.save_playlist(uuid,integer,text,uuid[]), public.set_mood_consent(boolean), public.start_listening(uuid,integer), public.end_listening(uuid,integer) to authenticated;

drop policy owner_read on public.mood_checkins;
create policy owner_read_recent on public.mood_checkins for select to authenticated using (owner_id = (select auth.uid()) and created_at > now() - interval '90 days');
drop policy owner_read on public.listening_sessions;
create policy owner_read_recent on public.listening_sessions for select to authenticated using (owner_id = (select auth.uid()) and started_at > now() - interval '90 days');

create function public.notify_personal_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_uuid uuid;
begin
  if TG_TABLE_NAME = 'profiles' then
    owner_uuid := case when TG_OP = 'DELETE' then OLD.id else NEW.id end;
  else
    owner_uuid := case when TG_OP = 'DELETE' then OLD.owner_id else NEW.owner_id end;
  end if;
  -- Auth deletion can run under supabase_auth_admin, without realtime grants.
  -- Authenticated clients are the only source of app mutations needing a broadcast.
  if auth.uid() is not null then
    perform realtime.send(jsonb_build_object('scope', TG_TABLE_NAME), 'invalidate', 'user:' || owner_uuid::text, true);
  end if;
  return null;
end;
$$;
revoke all on function public.notify_personal_change() from public;
do $$ declare tab text; begin
  foreach tab in array array['profiles','favorites','playlists','playlist_items','mood_checkins'] loop
    execute format('create trigger notify_personal_change after insert or update or delete on public.%I for each row execute function public.notify_personal_change()',tab);
  end loop;
end $$;
create policy personal_broadcast_read on realtime.messages for select to authenticated using (
  extension = 'broadcast' and realtime.topic() = 'user:' || (select auth.uid())::text
);

do $$ begin
  if exists(select 1 from storage.buckets where id='audio' and public) then
    raise exception 'HealingMuse requires a private audio bucket. Review the existing bucket before applying this migration.';
  end if;
end $$;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('audio','audio',false,52428800,array['audio/mpeg']) on conflict(id) do nothing;
create policy admin_audio_insert on storage.objects for insert to authenticated with check (bucket_id = 'audio' and (select public.is_content_admin()));
create policy admin_audio_read on storage.objects for select to authenticated using (bucket_id = 'audio' and (select public.is_content_admin()));
-- Immutable audio filenames prevent cached audio from silently changing.
-- Published objects may only be retired, not overwritten or deleted by clients.

create table public.rate_limits (
  key text not null,
  bucket text not null,
  window_at timestamptz not null,
  requests integer not null,
  primary key(key, bucket)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
create function public.consume_rate_limit(p_key text,p_bucket text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare amount integer;
begin
  insert into public.rate_limits(key,bucket,window_at,requests) values(p_key,p_bucket,now(),1)
  on conflict(key,bucket) do update set
    requests = case when public.rate_limits.window_at < now() - make_interval(secs => p_seconds) then 1 else public.rate_limits.requests + 1 end,
    window_at = case when public.rate_limits.window_at < now() - make_interval(secs => p_seconds) then now() else public.rate_limits.window_at end
  returning requests into amount;
  return amount <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text,text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;

commit;
