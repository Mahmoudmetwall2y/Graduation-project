-- Disable realtime publication for selected tables (Supabase free plan workaround)
-- Run in Supabase SQL Editor

ALTER PUBLICATION supabase_realtime DROP TABLE public.devices;
ALTER PUBLICATION supabase_realtime DROP TABLE public.sessions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.predictions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.session_notes;
ALTER PUBLICATION supabase_realtime DROP TABLE public.live_metrics;
ALTER PUBLICATION supabase_realtime DROP TABLE public.patients;
