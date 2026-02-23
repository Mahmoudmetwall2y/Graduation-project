-- Drop realtime triggers that call realtime.broadcast_changes (safe)
-- Run in Supabase SQL Editor

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schemaname,
      c.relname AS tablename,
      t.tgname AS triggername
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE pn.nspname = 'realtime'
      AND p.proname = 'broadcast_changes'
      AND n.nspname = 'public'
      AND c.relname IN ('devices','sessions','predictions','session_notes','live_metrics','patients')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', r.triggername, r.schemaname, r.tablename);
  END LOOP;
END $$;
