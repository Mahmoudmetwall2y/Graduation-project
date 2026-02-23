-- Find triggers referencing broadcast_changes
SELECT
  n.nspname AS schema,
  c.relname AS table,
  t.tgname AS trigger,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE pg_get_triggerdef(t.oid) ILIKE '%broadcast_changes%';

-- Find functions referencing broadcast_changes
SELECT
  n.nspname AS schema,
  p.proname AS function,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%broadcast_changes%';
