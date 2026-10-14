begin;
-- Consistent Auth, profile, and session locking serializes check-ins with revocation and erasure.
create or replace function public.start_listening(p_track uuid, p_score integer default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare session_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  perform 1 from auth.users where id = auth.uid() for key share;
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = auth.uid() and mood_consent_at is not null for update;
  if not found then raise exception 'consent_required' using errcode = '42501'; end if;
  if p_score is not null and p_score not between 1 and 5 then raise exception 'invalid' using errcode = '22023'; end if;
  if not exists(select 1 from public.tracks where id = p_track and status = 'published') then raise exception 'invalid_track' using errcode = '22023'; end if;
  insert into public.listening_sessions(owner_id, track_id) values(auth.uid(), p_track) returning id into session_id;
  if p_score is not null then insert into public.mood_checkins(owner_id, session_id, phase, score) values(auth.uid(), session_id, 'before', p_score); end if;
  return session_id;
end;
$$;
create or replace function public.end_listening(p_session uuid, p_score integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare session_row public.listening_sessions;
begin
  perform 1 from auth.users where id = auth.uid() for key share;
  if not found then raise exception 'unauthorized' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = auth.uid() and mood_consent_at is not null for update;
  if not found then raise exception 'consent_required' using errcode = '42501'; end if;
  select * into session_row from public.listening_sessions where id = p_session and owner_id = auth.uid() and started_at > now() - interval '90 days' for update;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  if p_score is not null and p_score not between 1 and 5 then raise exception 'invalid' using errcode = '22023'; end if;
  update public.listening_sessions set ended_at = coalesce(ended_at, now()) where id = p_session;
  if p_score is not null then
    insert into public.mood_checkins(owner_id, session_id, phase, score) values(auth.uid(), p_session, 'after', p_score)
    on conflict(session_id, phase) do nothing;
  end if;
end;
$$;
commit;
