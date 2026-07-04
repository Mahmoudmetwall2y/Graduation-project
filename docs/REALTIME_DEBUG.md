## Realtime Trigger Debug

If you still see:
`function realtime.broadcast_changes(text, text, text, name, name, jsonb, jsonb) does not exist`

Run the query below in Supabase SQL Editor and send me the full results:

```sql
SELECT
  n.nspname AS schema,
  c.relname AS table,
  t.tgname AS trigger,
  p.proname AS function,
  pn.nspname AS function_schema
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE pn.nspname = 'realtime'
  AND p.proname = 'broadcast_changes';
```

Also send the full error text (including table or trigger name) so I can provide exact DROP statements.
