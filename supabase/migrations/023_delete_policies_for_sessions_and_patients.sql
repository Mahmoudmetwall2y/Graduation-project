-- AscultiCor Database Migration
-- Migration: 023_delete_policies_for_sessions_and_patients
-- Description: Enable safe session and patient deletes for owners, while preserving admin overrides
-- Created: 2026-03-03

-- ============================================================
-- Sessions DELETE policies
-- ============================================================

DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.sessions;
CREATE POLICY "Users can delete their own sessions"
  ON public.sessions FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND public.user_role() <> 'readonly'
  );

DROP POLICY IF EXISTS "Admins can delete any session in their org" ON public.sessions;
CREATE POLICY "Admins can delete any session in their org"
  ON public.sessions FOR DELETE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.is_admin()
  );

-- ============================================================
-- Patients DELETE policies
-- ============================================================

DROP POLICY IF EXISTS "Users can delete patients they created" ON public.patients;
CREATE POLICY "Users can delete patients they created"
  ON public.patients FOR DELETE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND created_by = auth.uid()
    AND public.user_role() <> 'readonly'
  );

DROP POLICY IF EXISTS "Admins can delete patients in their org" ON public.patients;
CREATE POLICY "Admins can delete patients in their org"
  ON public.patients FOR DELETE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.is_admin()
  );
