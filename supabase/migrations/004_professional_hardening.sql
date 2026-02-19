-- AscultiCor Database Hardening
-- Migration: 004_professional_hardening.sql
-- Description: Fixes schema/runtime issues and adds professional-grade constraints/policies.

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- AUTH/HELPER FUNCTION COMPATIBILITY
-- ============================================================
-- Some migrations reference auth.user_org_id()/auth.is_admin(),
-- others reference public.user_org_id()/public.is_admin().
-- Keep both entry points to avoid policy breakage.

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID AS $$
  SELECT public.user_org_id();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT public.is_admin();
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- DATA INTEGRITY CONSTRAINTS
-- ============================================================

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_time_order_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_time_order_check
  CHECK (ended_at IS NULL OR ended_at >= started_at);

ALTER TABLE public.recordings
  DROP CONSTRAINT IF EXISTS recordings_duration_non_negative_check;
ALTER TABLE public.recordings
  ADD CONSTRAINT recordings_duration_non_negative_check
  CHECK (duration_sec IS NULL OR duration_sec >= 0);

ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_latency_non_negative_check;
ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_latency_non_negative_check
  CHECK (latency_ms IS NULL OR latency_ms >= 0);

ALTER TABLE public.llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_latency_non_negative_check;
ALTER TABLE public.llm_reports
  ADD CONSTRAINT llm_reports_latency_non_negative_check
  CHECK (latency_ms IS NULL OR latency_ms >= 0);

ALTER TABLE public.llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_tokens_non_negative_check;
ALTER TABLE public.llm_reports
  ADD CONSTRAINT llm_reports_tokens_non_negative_check
  CHECK (tokens_used IS NULL OR tokens_used >= 0);

-- ============================================================
-- UNIQUENESS + PERFORMANCE INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_devices_org_device_name
  ON public.devices (org_id, device_name);

-- Enforce at most one completed report per session/model/version.
CREATE UNIQUE INDEX IF NOT EXISTS ux_llm_reports_completed_per_model
  ON public.llm_reports (session_id, model_name, model_version)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_recordings_org_created
  ON public.recordings (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_predictions_org_created
  ON public.predictions (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_reports_org_created
  ON public.llm_reports (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_telemetry_org_device_recorded
  ON public.device_telemetry (org_id, device_id, recorded_at DESC);

-- ============================================================
-- RLS ALIGNMENT FOR LLM REPORTS
-- ============================================================
-- Frontend route uses authenticated user context to create/update reports.
-- These policies allow tenant-scoped writes while preserving service role access.

DROP POLICY IF EXISTS "Users can view LLM reports in their org" ON public.llm_reports;
DROP POLICY IF EXISTS "Service role can insert LLM reports" ON public.llm_reports;
DROP POLICY IF EXISTS "Users can insert LLM reports in their org" ON public.llm_reports;
DROP POLICY IF EXISTS "Users can update LLM reports in their org" ON public.llm_reports;
DROP POLICY IF EXISTS "Service role can manage LLM reports" ON public.llm_reports;

CREATE POLICY "Users can view LLM reports in their org"
  ON public.llm_reports FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Users can insert LLM reports in their org"
  ON public.llm_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_id
        AND s.org_id = public.user_org_id()
        AND s.device_id = llm_reports.device_id
    )
  );

CREATE POLICY "Users can update LLM reports in their org"
  ON public.llm_reports FOR UPDATE
  TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

CREATE POLICY "Service role can manage LLM reports"
  ON public.llm_reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- API KEY FUNCTION FIX
-- ============================================================
-- Previous implementation attempted INSERT without created_by (NOT NULL column).

CREATE OR REPLACE FUNCTION public.generate_device_api_key(
  device_uuid UUID,
  created_by_uuid UUID DEFAULT auth.uid()
)
RETURNS TEXT AS $$
DECLARE
  new_key TEXT;
  hashed_key TEXT;
BEGIN
  IF created_by_uuid IS NULL THEN
    RAISE EXCEPTION 'created_by_uuid cannot be null';
  END IF;

  -- cryptographically strong random key
  new_key := 'ac_' || encode(gen_random_bytes(32), 'hex');
  hashed_key := crypt(new_key, gen_salt('bf'));

  INSERT INTO public.device_api_keys (
    device_id,
    org_id,
    key_hash,
    key_prefix,
    name,
    created_by
  )
  SELECT
    d.id,
    d.org_id,
    hashed_key,
    left(new_key, 10),
    'Auto-generated key',
    created_by_uuid
  FROM public.devices d
  WHERE d.id = device_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device % not found', device_uuid;
  END IF;

  RETURN new_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- TRIGGER SAFETY FIX
-- ============================================================
-- Prevent counting the same session multiple times if status is re-written to 'done'.

DROP TRIGGER IF EXISTS session_completion_summary ON public.sessions;
CREATE TRIGGER session_completion_summary
  AFTER UPDATE OF status ON public.sessions
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.update_recording_summary();
