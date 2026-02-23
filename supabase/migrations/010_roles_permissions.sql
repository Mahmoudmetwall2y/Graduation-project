-- AscultiCor Roles & Permissions
-- Migration: 010_roles_permissions.sql
-- Description: Expands profile roles and enforces readonly restrictions in RLS policies.

-- ============================================================
-- ROLE ENUM EXPANSION
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'admin', 'clinician', 'readonly'));

-- Helper for role lookup
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- DEVICES POLICIES (restrict readonly)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert devices in their org" ON devices;
CREATE POLICY "Users can insert devices in their org"
  ON devices FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND owner_user_id = auth.uid()
    AND public.user_role() <> 'readonly'
  );

DROP POLICY IF EXISTS "Operators can insert their own devices" ON devices;
CREATE POLICY "Operators can insert their own devices"
  ON devices FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND owner_user_id = auth.uid()
    AND public.user_role() <> 'readonly'
  );

DROP POLICY IF EXISTS "Admins can insert any device in their org" ON devices;
CREATE POLICY "Admins can insert any device in their org"
  ON devices FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS "Owners can update their devices" ON devices;
CREATE POLICY "Owners can update their devices"
  ON devices FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid() AND public.user_role() <> 'readonly');

DROP POLICY IF EXISTS "Admins can update any device in their org" ON devices;
CREATE POLICY "Admins can update any device in their org"
  ON devices FOR UPDATE
  TO authenticated
  USING (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS "Owners can delete their devices" ON devices;
CREATE POLICY "Owners can delete their devices"
  ON devices FOR DELETE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND org_id = public.user_org_id()
    AND public.user_role() <> 'readonly'
  );

DROP POLICY IF EXISTS "Admins can delete any device in their org" ON devices;
CREATE POLICY "Admins can delete any device in their org"
  ON devices FOR DELETE
  TO authenticated
  USING (org_id = public.user_org_id() AND public.is_admin());

-- ============================================================
-- SESSIONS POLICIES (restrict readonly)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert sessions in their org" ON sessions;
CREATE POLICY "Users can insert sessions in their org"
  ON sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND created_by = auth.uid()
    AND public.user_role() <> 'readonly'
  );

DROP POLICY IF EXISTS "Users can update their own sessions" ON sessions;
CREATE POLICY "Users can update their own sessions"
  ON sessions FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND public.user_role() <> 'readonly'
  );

-- ============================================================
-- PATIENTS POLICIES (restrict readonly)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert patients in their org" ON patients;
CREATE POLICY "Users can insert patients in their org"
  ON patients FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND created_by = auth.uid()
    AND public.user_role() <> 'readonly'
  );

DROP POLICY IF EXISTS "Users can update patients they created" ON patients;
CREATE POLICY "Users can update patients they created"
  ON patients FOR UPDATE
  TO authenticated
  USING (org_id = public.user_org_id() AND created_by = auth.uid() AND public.user_role() <> 'readonly')
  WITH CHECK (org_id = public.user_org_id() AND public.user_role() <> 'readonly');

-- ============================================================
-- SESSION NOTES POLICIES (restrict readonly)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert session notes in their org" ON session_notes;
CREATE POLICY "Users can insert session notes in their org"
  ON session_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND author_id = auth.uid()
    AND public.user_role() <> 'readonly'
    AND EXISTS (
      SELECT 1
      FROM sessions s
      WHERE s.id = session_id
        AND s.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own session notes" ON session_notes;
CREATE POLICY "Users can delete their own session notes"
  ON session_notes FOR DELETE
  TO authenticated
  USING (org_id = public.user_org_id() AND author_id = auth.uid() AND public.user_role() <> 'readonly');

-- ============================================================
-- SAVED VIEWS POLICIES (restrict readonly)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert their saved views" ON saved_views;
CREATE POLICY "Users can insert their saved views"
  ON saved_views FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.user_org_id() AND user_id = auth.uid() AND public.user_role() <> 'readonly');

DROP POLICY IF EXISTS "Users can delete their saved views" ON saved_views;
CREATE POLICY "Users can delete their saved views"
  ON saved_views FOR DELETE
  TO authenticated
  USING (org_id = public.user_org_id() AND user_id = auth.uid() AND public.user_role() <> 'readonly');
