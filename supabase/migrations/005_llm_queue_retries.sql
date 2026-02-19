-- AscultiCor LLM queue retry hardening
-- Migration: 005_llm_queue_retries.sql
-- Description: Adds retry controls to llm_reports for resilient async processing.

ALTER TABLE public.llm_reports
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE public.llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_retry_count_non_negative_check;
ALTER TABLE public.llm_reports
  ADD CONSTRAINT llm_reports_retry_count_non_negative_check
  CHECK (retry_count >= 0);

ALTER TABLE public.llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_max_retries_non_negative_check;
ALTER TABLE public.llm_reports
  ADD CONSTRAINT llm_reports_max_retries_non_negative_check
  CHECK (max_retries >= 0);

CREATE INDEX IF NOT EXISTS idx_llm_reports_retry_ready
  ON public.llm_reports (status, next_retry_at, created_at)
  WHERE status = 'pending';
