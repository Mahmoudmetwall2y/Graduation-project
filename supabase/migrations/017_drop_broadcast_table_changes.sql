-- Drop triggers/functions that call realtime.broadcast_changes via broadcast_table_changes
-- Run in Supabase SQL Editor

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schemaname, c.relname AS tablename, t.tgname AS triggername
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'broadcast_table_changes'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', r.triggername, r.schemaname, r.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.broadcast_table_changes();
