## Realtime Error Fix

Error shown:
`function realtime.broadcast_changes(text, text, text, name, name, jsonb, jsonb) does not exist`

This means a Realtime trigger exists, but the Realtime function is missing in your DB. Inserts to tables with Realtime enabled will fail.

### Fix options (pick one)

#### Option A: Install Realtime functions (recommended if you want realtime updates)
Run this in Supabase SQL Editor:

```sql
create extension if not exists supabase_realtime;
```

Then re-enable Realtime for the affected tables (so the triggers get recreated cleanly):
- Database → Replication: toggle ON for
  - `devices`
  - `sessions`
  - `predictions`
  - `session_notes`
  - `live_metrics`
  - `patients`

#### Option B: Disable Realtime for those tables (quick workaround)
If you don’t need realtime yet, turn it OFF in Database → Replication for the tables above. This removes the trigger and inserts will work.

---

If you are self-hosting Supabase, confirm:
1. Is the Realtime service container running?
2. Did you apply the Realtime migrations?

Tell me your environment (Supabase cloud vs self-hosted) if you want exact commands.
