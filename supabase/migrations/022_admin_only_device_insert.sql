-- AscultiCor Database Migration
-- Migration: 022_admin_only_device_insert
-- Description: Restrict device INSERT/provisioning to admin users only
-- Created: 2026-03-03

DROP POLICY IF EXISTS "Users can insert devices in their org" ON public.devices;
DROP POLICY IF EXISTS "Operators can insert their own devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can insert any device in their org" ON public.devices;
DROP POLICY IF EXISTS "Admins can insert devices in their org" ON public.devices;

CREATE POLICY "Admins can insert devices in their org"
  ON public.devices FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.is_admin()
  );
