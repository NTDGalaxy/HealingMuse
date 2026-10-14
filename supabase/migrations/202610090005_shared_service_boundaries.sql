begin;
-- Restrictive policies compose with permissive policies already present in an existing project.
-- Other applications' buckets and channel namespaces keep their existing authorization.
create policy healingmuse_audio_read_boundary on storage.objects as restrictive
for select to authenticated using (bucket_id <> 'audio' or (select public.is_content_admin()));
create policy healingmuse_audio_guest_read_boundary on storage.objects as restrictive
for select to anon using (bucket_id <> 'audio');
create policy healingmuse_audio_insert_boundary on storage.objects as restrictive
for insert to authenticated with check (bucket_id <> 'audio' or (select public.is_content_admin()));
create policy healingmuse_audio_guest_insert_boundary on storage.objects as restrictive
for insert to anon with check (bucket_id <> 'audio');
create policy healingmuse_audio_update_boundary on storage.objects as restrictive
for update to anon, authenticated using (bucket_id <> 'audio') with check (bucket_id <> 'audio');
create policy healingmuse_audio_delete_boundary on storage.objects as restrictive
for delete to anon, authenticated using (bucket_id <> 'audio');

create policy healingmuse_personal_channel_boundary on realtime.messages as restrictive
for all to anon, authenticated using (
  realtime.topic() not like 'user:%'
  or (extension='broadcast' and realtime.topic()='user:' || (select auth.uid())::text)
) with check (
  realtime.topic() not like 'user:%'
  or (extension='broadcast' and realtime.topic()='user:' || (select auth.uid())::text)
);
commit;
