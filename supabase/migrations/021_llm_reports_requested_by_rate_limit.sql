-- AscultiCor Database Migration
-- Migration: 021_llm_reports_requested_by_rate_limit
-- Description: Track requesting user on llm_reports and enforce user-bound inserts for reliable distributed rate limiting
-- Created: 2026-03-03

ALTER TABLE public.llm_reports
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.profiles(id);

-- Backfill historical rows from session creator where possible.
UPDATE public.llm_reports lr
SET requested_by = s.created_by
FROM public.sessions s
WHERE lr.session_id = s.id
  AND lr.requested_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_llm_reports_requested_by_created
  ON public.llm_reports (requested_by, created_at DESC);

-- Align INSERT policy so authenticated users can only enqueue on their own behalf.
DROP POLICY IF EXISTS "Users can insert LLM reports in their org" ON public.llm_reports;
CREATE POLICY "Users can insert LLM reports in their org"
  ON public.llm_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND requested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_id
        AND s.org_id = public.user_org_id()
        AND s.device_id = llm_reports.device_id
    )
  );

COMMENT ON COLUMN public.llm_reports.requested_by
IS 'Authenticated user who requested report generation';
