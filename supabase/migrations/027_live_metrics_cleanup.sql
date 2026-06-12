-- live_metrics cleanup: Auto-delete rows older than 24 hours.
-- Requires pg_cron extension (enabled by default on Supabase).
--
-- If pg_cron is not available, run the DELETE statement manually or via
-- a scheduled cloud function.

-- Schedule daily cleanup at 03:00 UTC
SELECT cron.schedule(
  'cleanup-live-metrics',
  '0 3 * * *',
  $$DELETE FROM public.live_metrics WHERE created_at < NOW() - INTERVAL '24 hours'$$
);
