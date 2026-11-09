begin;
-- Playback locators and B2 delivery receipts look release items up by recording, not by release.
create index if not exists catalogue_release_items_track on public.catalogue_release_items(track_id);
commit;
