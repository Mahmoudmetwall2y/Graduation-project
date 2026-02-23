-- Simple search for broadcast_changes references without pg_get_* helpers

SELECT
  n.nspname AS schema,
  c.relname AS table,
  t.tgname AS trigger,
  p.proname AS function
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE p.proname ILIKE '%broadcast_changes%';

SELECT
  n.nspname AS schema,
  p.proname AS function,
  p.prosrc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc ILIKE '%broadcast_changes%';
