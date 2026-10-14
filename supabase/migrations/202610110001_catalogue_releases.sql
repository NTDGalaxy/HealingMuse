begin;

-- A trusted delivery worker attests to downloaded bytes, pinning the storage object version.
create table public.audio_deliveries (
 track_id uuid primary key references public.tracks(id),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 bytes bigint not null check (bytes > 0),
 object_id uuid not null,
 object_updated_at timestamptz not null,
 verified_at timestamptz not null default now()
);
create table public.catalogue_releases (
 id uuid primary key,
 manifest_hash text not null unique check (manifest_hash ~ '^[a-f0-9]{64}$'),
 title text not null check (length(title) between 1 and 160),
 expected_count integer not null check (expected_count between 1 and 10000),
 created_at timestamptz not null default now()
);
create table public.catalogue_release_items (
 release_id uuid not null references public.catalogue_releases(id),
 track_id uuid not null references public.tracks(id),
 expected_metadata jsonb not null,
 primary key (release_id, track_id)
);
create table public.catalogue_publications (
 release_id uuid primary key references public.catalogue_releases(id),
 manifest_hash text not null,
 reviewer_id uuid not null,
 reviewer_name text not null check (length(btrim(reviewer_name)) between 1 and 120),
 attestation_version text not null check (attestation_version = 'human-review-v1'),
 published_at timestamptz not null default now(),
 previous_states jsonb not null
);

do $$ declare tab text; begin
 foreach tab in array array['audio_deliveries','catalogue_releases','catalogue_release_items','catalogue_publications'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public, anon, authenticated, service_role',tab);
  execute format('grant select on public.%I to authenticated, service_role',tab);
  execute format('create policy administrator_read on public.%I for select to authenticated using ((select public.is_content_admin()))',tab);
 end loop;
end $$;

create function public.release_track_metadata(t public.tracks) returns jsonb
 language sql immutable set search_path = '' as $$
 select to_jsonb(t) - array['status','rights_verified','listening_reviewed','created_at','search_text']
$$;
revoke all on function public.release_track_metadata(public.tracks) from public, anon, authenticated, service_role;

create function public.record_audio_delivery(p_track_id uuid, p_sha256 text, p_bytes bigint) returns void
 language plpgsql security definer set search_path = '' as $$
declare t public.tracks; o storage.objects;
begin
 select * into t from public.tracks where id=p_track_id for share;
 if not found or t.source->>'kind'<>'hosted' or t.sha256 is distinct from p_sha256 or t.bytes is distinct from p_bytes then
  raise exception 'delivery_mismatch' using errcode='40001';
 end if;
 select * into o from storage.objects where bucket_id='audio' and name=t.source->>'path' for share;
 if not found or (o.metadata->>'size')::bigint is distinct from p_bytes then
  raise exception 'delivery_missing' using errcode='40001';
 end if;
 insert into public.audio_deliveries(track_id,sha256,bytes,object_id,object_updated_at)
 values(p_track_id,p_sha256,p_bytes,o.id,o.updated_at)
 on conflict(track_id) do update set sha256=excluded.sha256,bytes=excluded.bytes,
 object_id=excluded.object_id,object_updated_at=excluded.object_updated_at,verified_at=now();
end $$;
revoke all on function public.record_audio_delivery(uuid,text,bigint) from public, anon, authenticated, service_role;
grant execute on function public.record_audio_delivery(uuid,text,bigint) to service_role;

create function public.catalogue_release_summary() returns jsonb
 language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_content_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'title',r.title,'manifestHash',r.manifest_hash,'expectedCount',r.expected_count,
  'createdAt',r.created_at,'publishedAt',p.published_at,'reviewerName',p.reviewer_name,
  'matchingCount',(select count(*) from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
   where i.release_id=r.id and i.expected_metadata=public.release_track_metadata(t) and t.status<>'retired'),
  'deliveredCount',(select count(*) from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
   join public.audio_deliveries d on d.track_id=t.id and d.sha256=t.sha256 and d.bytes=t.bytes
   join storage.objects o on o.id=d.object_id and o.updated_at=d.object_updated_at and o.bucket_id='audio'
    and o.name=t.source->>'path' and (o.metadata->>'size')::bigint=d.bytes
   where i.release_id=r.id)
 ) order by r.created_at desc) from public.catalogue_releases r
 left join public.catalogue_publications p on p.release_id=r.id),'[]'::jsonb);
end $$;
revoke all on function public.catalogue_release_summary() from public, anon, authenticated, service_role;
grant execute on function public.catalogue_release_summary() to authenticated;

create function public.publish_catalogue_release(p_release_id uuid, p_manifest_hash text,
 p_reviewer_name text, p_attestation_version text) returns jsonb
 language plpgsql security definer set search_path = '' as $$
declare r public.catalogue_releases; p public.catalogue_publications; previous jsonb;
begin
 -- Serialize revocation, release retries, metadata edits and storage replacements.
 perform 1 from public.content_admins where user_id=auth.uid() for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 if p_reviewer_name is null or length(btrim(p_reviewer_name)) not between 1 and 120
  or p_attestation_version is distinct from 'human-review-v1' then
  raise exception 'invalid_attestation' using errcode='22023';
 end if;
 select * into r from public.catalogue_releases where id=p_release_id for update;
 if not found or r.manifest_hash is distinct from p_manifest_hash then
  raise exception 'manifest_changed' using errcode='40001';
 end if;
 select * into p from public.catalogue_publications where release_id=r.id;
 if found then return jsonb_build_object('id',r.id,'publishedAt',p.published_at,'count',r.expected_count,'repeated',true); end if;
 perform 1 from public.catalogue_release_items where release_id=r.id for share;
 if (select count(*) from public.catalogue_release_items where release_id=r.id)<>r.expected_count then
  raise exception 'incomplete_manifest' using errcode='40001';
 end if;
 perform 1 from public.tracks t join public.catalogue_release_items i on i.track_id=t.id where i.release_id=r.id order by t.id for update of t;
 perform 1 from public.audio_deliveries d join public.catalogue_release_items i on i.track_id=d.track_id where i.release_id=r.id for share of d;
 perform 1 from storage.objects o join public.audio_deliveries d on d.object_id=o.id
  join public.catalogue_release_items i on i.track_id=d.track_id where i.release_id=r.id for share of o;
 if exists(select 1 from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
  left join public.audio_deliveries d on d.track_id=t.id
  left join storage.objects o on o.id=d.object_id
  where i.release_id=r.id and (i.expected_metadata<>public.release_track_metadata(t) or t.status='retired'
   or t.source->>'kind'<>'hosted' or not t.human_created or d.track_id is null
   or d.sha256 is distinct from t.sha256 or d.bytes is distinct from t.bytes
   or o.id is null or o.updated_at is distinct from d.object_updated_at or o.bucket_id<>'audio'
   or o.name is distinct from t.source->>'path' or (o.metadata->>'size')::bigint is distinct from t.bytes)) then
  raise exception 'release_changed_or_incomplete' using errcode='40001';
 end if;
 select jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'rightsVerified',t.rights_verified,
  'listeningReviewed',t.listening_reviewed) order by t.id) into previous
 from public.tracks t join public.catalogue_release_items i on i.track_id=t.id where i.release_id=r.id;
 update public.tracks t set status='published',rights_verified=true,listening_reviewed=true
 from public.catalogue_release_items i where i.release_id=r.id and i.track_id=t.id;
 insert into public.catalogue_publications(release_id,manifest_hash,reviewer_id,reviewer_name,attestation_version,previous_states)
 values(r.id,r.manifest_hash,auth.uid(),btrim(p_reviewer_name),p_attestation_version,previous)
 returning * into p;
 return jsonb_build_object('id',r.id,'publishedAt',p.published_at,'count',r.expected_count,'repeated',false);
end $$;
revoke all on function public.publish_catalogue_release(uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.publish_catalogue_release(uuid,text,text,text) to authenticated;
commit;
