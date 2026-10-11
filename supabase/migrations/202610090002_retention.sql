begin;
create extension if not exists pg_cron;

-- Enforce daily physical deletion in addition to read-time RLS retention.
select cron.schedule('healingmuse-private-retention','17 18 * * *', $$
  delete from public.listening_sessions where started_at <= now() - interval '90 days';
  delete from public.mood_checkins where created_at <= now() - interval '90 days';
  delete from public.rate_limits where window_at < now() - interval '1 day';
$$);
commit;
