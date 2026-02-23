-- AscultiCor Audit Log (user insert policy)
-- Migration: 009_audit_log_policies.sql
-- Description: Allow authenticated users to insert audit logs for their org.

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert audit logs in their org" ON audit_logs;
CREATE POLICY "Users can insert audit logs in their org"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.user_org_id() AND user_id = auth.uid());
