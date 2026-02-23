-- Disable realtime publication for selected tables (safe, skips missing)
-- Run in Supabase SQL Editor

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['devices','sessions','predictions','session_notes','live_metrics','patients']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
