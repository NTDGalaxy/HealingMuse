begin;

-- Delivery receipts are private, independent of public recording metadata.
create table public.b2_audio_deliveries (
 track_id uuid primary key references public.tracks(id),
 endpoint text not null check (endpoint ~ '^https://s3\.[a-z0-9-]+\.backblazeb2\.com$'),
 bucket text not null check (bucket ~ '^[a-z0-9][a-z0-9.-]{4,61}[a-z0-9]$'),
 object_key text not null,
 version_id text not null check (length(version_id) between 1 and 1024 and version_id <> 'null'),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 bytes bigint not null check (bytes > 0),
 etag text not null check (length(etag) between 1 and 1024),
 verified_at timestamptz not null default now(),
 check (object_key = 'healingmuse/audio/' || track_id::text || '/' || sha256 || '.mp3')
);
alter table public.b2_audio_deliveries enable row level security;
revoke all on public.b2_audio_deliveries from public, anon, authenticated, service_role;
grant select on public.b2_audio_deliveries to authenticated, service_role;
create policy administrator_read on public.b2_audio_deliveries for select to authenticated
 using ((select public.is_content_admin()));

alter table public.catalogue_releases add column required_storage_provider text not null default 'supabase'
 check (required_storage_provider in ('supabase','b2'));
alter table public.catalogue_release_items add column expected_storage jsonb;
alter table public.catalogue_publications add column storage_provider text not null default 'supabase'
 check (storage_provider in ('supabase','b2'));
alter table public.catalogue_publications add column delivery_snapshots jsonb not null default '[]';

create function public.b2_delivery_metadata(d public.b2_audio_deliveries) returns jsonb
 language sql immutable set search_path = '' as $$ select to_jsonb(d) - 'verified_at' $$;
revoke all on function public.b2_delivery_metadata(public.b2_audio_deliveries) from public, anon, authenticated, service_role;

create function public.record_b2_audio_delivery(p_track_id uuid,p_endpoint text,p_bucket text,
 p_object_key text,p_version_id text,p_sha256 text,p_bytes bigint,p_etag text) returns void
 language plpgsql security definer set search_path = '' as $$
declare t public.tracks; d public.b2_audio_deliveries; candidate jsonb;
begin
 select * into t from public.tracks where id=p_track_id for share;
 if not found or t.status='retired' or t.source->>'kind'<>'hosted'
  or t.sha256 is distinct from p_sha256 or t.bytes is distinct from p_bytes then
  raise exception 'delivery_mismatch' using errcode='40001';
 end if;
 candidate := jsonb_build_object('track_id',p_track_id,'endpoint',p_endpoint,'bucket',p_bucket,
  'object_key',p_object_key,'version_id',p_version_id,'sha256',p_sha256,'bytes',p_bytes,'etag',p_etag);
 if exists(select 1 from public.catalogue_release_items i join public.catalogue_releases r on r.id=i.release_id
  where i.track_id=p_track_id and r.required_storage_provider='b2' and i.expected_storage is distinct from candidate) then
  raise exception 'registered_delivery_changed' using errcode='40001';
 end if;
 insert into public.b2_audio_deliveries(track_id,endpoint,bucket,object_key,version_id,sha256,bytes,etag)
 values(p_track_id,p_endpoint,p_bucket,p_object_key,p_version_id,p_sha256,p_bytes,p_etag)
 on conflict(track_id) do update set endpoint=excluded.endpoint,bucket=excluded.bucket,
 object_key=excluded.object_key,version_id=excluded.version_id,sha256=excluded.sha256,
 bytes=excluded.bytes,etag=excluded.etag,verified_at=now();
end $$;
revoke all on function public.record_b2_audio_delivery(uuid,text,text,text,text,text,bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.record_b2_audio_delivery(uuid,text,text,text,text,text,bigint,text) to service_role;

-- A missing receipt for a B2 release must never silently fall back to another provider.
create function public.audio_storage_locator(p_track_id uuid) returns jsonb
 language plpgsql stable security definer set search_path = '' as $$
declare d public.b2_audio_deliveries;
begin
 select * into d from public.b2_audio_deliveries where track_id=p_track_id;
 if exists(select 1 from public.catalogue_release_items i join public.catalogue_releases r on r.id=i.release_id
  where i.track_id=p_track_id and r.required_storage_provider='b2'
   and (d.track_id is null or i.expected_storage is distinct from public.b2_delivery_metadata(d))) then
  return jsonb_build_object('provider','b2','unavailable',true);
 end if;
 if d.track_id is not null then return jsonb_build_object('provider','b2','delivery',public.b2_delivery_metadata(d)); end if;
 return jsonb_build_object('provider','supabase');
end $$;
revoke all on function public.audio_storage_locator(uuid) from public, anon, authenticated, service_role;
grant execute on function public.audio_storage_locator(uuid) to service_role;

create or replace function public.catalogue_release_summary() returns jsonb
 language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_content_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'title',r.title,'manifestHash',r.manifest_hash,'expectedCount',r.expected_count,
  'storageProvider',r.required_storage_provider,'createdAt',r.created_at,'publishedAt',p.published_at,'reviewerName',p.reviewer_name,
  'matchingCount',(select count(*) from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
   where i.release_id=r.id and i.expected_metadata=public.release_track_metadata(t) and t.status<>'retired'),
  'deliveredCount',case when r.required_storage_provider='b2' then
   (select count(*) from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
    join public.b2_audio_deliveries d on d.track_id=t.id and d.sha256=t.sha256 and d.bytes=t.bytes
    where i.release_id=r.id and i.expected_storage=public.b2_delivery_metadata(d))
   else (select count(*) from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
    join public.audio_deliveries d on d.track_id=t.id and d.sha256=t.sha256 and d.bytes=t.bytes
    join storage.objects o on o.id=d.object_id and o.updated_at=d.object_updated_at and o.bucket_id='audio'
     and o.name=t.source->>'path' and (o.metadata->>'size')::bigint=d.bytes where i.release_id=r.id) end
 ) order by r.created_at desc) from public.catalogue_releases r
 left join public.catalogue_publications p on p.release_id=r.id),'[]'::jsonb);
end $$;
revoke all on function public.catalogue_release_summary() from public, anon, authenticated, service_role;
grant execute on function public.catalogue_release_summary() to authenticated;

create or replace function public.publish_catalogue_release(p_release_id uuid,p_manifest_hash text,
 p_reviewer_name text,p_attestation_version text) returns jsonb
 language plpgsql security definer set search_path = '' as $$
declare r public.catalogue_releases; p public.catalogue_publications; previous jsonb; deliveries jsonb := '[]';
begin
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
 if exists(select 1 from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
  where i.release_id=r.id and (i.expected_metadata<>public.release_track_metadata(t) or t.status='retired'
   or t.source->>'kind'<>'hosted' or not t.human_created)) then
  raise exception 'release_changed_or_incomplete' using errcode='40001';
 end if;
 if r.required_storage_provider='b2' then
  perform 1 from public.b2_audio_deliveries d join public.catalogue_release_items i on i.track_id=d.track_id
   where i.release_id=r.id for share of d;
  if exists(select 1 from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
   left join public.b2_audio_deliveries d on d.track_id=t.id where i.release_id=r.id
   and (d.track_id is null or d.sha256 is distinct from t.sha256 or d.bytes is distinct from t.bytes
    or i.expected_storage is distinct from public.b2_delivery_metadata(d))) then
   raise exception 'release_changed_or_incomplete' using errcode='40001';
  end if;
  select jsonb_agg(public.b2_delivery_metadata(d) order by d.track_id) into deliveries
   from public.b2_audio_deliveries d join public.catalogue_release_items i on i.track_id=d.track_id where i.release_id=r.id;
 else
  perform 1 from public.audio_deliveries d join public.catalogue_release_items i on i.track_id=d.track_id where i.release_id=r.id for share of d;
  perform 1 from storage.objects o join public.audio_deliveries d on d.object_id=o.id
   join public.catalogue_release_items i on i.track_id=d.track_id where i.release_id=r.id for share of o;
  if exists(select 1 from public.catalogue_release_items i join public.tracks t on t.id=i.track_id
   left join public.audio_deliveries d on d.track_id=t.id left join storage.objects o on o.id=d.object_id
   where i.release_id=r.id and (d.track_id is null or d.sha256 is distinct from t.sha256 or d.bytes is distinct from t.bytes
    or o.id is null or o.updated_at is distinct from d.object_updated_at or o.bucket_id<>'audio'
    or o.name is distinct from t.source->>'path' or (o.metadata->>'size')::bigint is distinct from t.bytes)) then
   raise exception 'release_changed_or_incomplete' using errcode='40001';
  end if;
 end if;
 select jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'rightsVerified',t.rights_verified,
  'listeningReviewed',t.listening_reviewed) order by t.id) into previous
 from public.tracks t join public.catalogue_release_items i on i.track_id=t.id where i.release_id=r.id;
 update public.tracks t set status='published',rights_verified=true,listening_reviewed=true
 from public.catalogue_release_items i where i.release_id=r.id and i.track_id=t.id;
 insert into public.catalogue_publications(release_id,manifest_hash,reviewer_id,reviewer_name,attestation_version,previous_states,storage_provider,delivery_snapshots)
 values(r.id,r.manifest_hash,auth.uid(),btrim(p_reviewer_name),p_attestation_version,previous,r.required_storage_provider,deliveries) returning * into p;
 return jsonb_build_object('id',r.id,'publishedAt',p.published_at,'count',r.expected_count,'repeated',false);
end $$;
revoke all on function public.publish_catalogue_release(uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.publish_catalogue_release(uuid,text,text,text) to authenticated;
commit;
