-- AscultiCor Database Migration
-- Migration: 020_fix_audit_log_insert_policy_drift
-- Description: Remove legacy permissive audit-log insert policy and enforce strict user-bound writes
-- Created: 2026-03-03

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Legacy policy from 003 could remain when migrations were applied incrementally.
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Recreate strict policy to ensure idempotent consistency.
DROP POLICY IF EXISTS "Users can insert audit logs in their org" ON public.audit_logs;
CREATE POLICY "Users can insert audit logs in their org"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.user_org_id() AND user_id = auth.uid());

COMMENT ON POLICY "Users can insert audit logs in their org" ON public.audit_logs
IS 'Authenticated users may insert only their own audit events within their organization';
