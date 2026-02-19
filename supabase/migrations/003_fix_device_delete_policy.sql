-- =============================================================
-- Fix: Add missing DELETE policy + update device_type constraint
-- Run this in Supabase SQL Editor
-- =============================================================

-- 1. Add DELETE policy for devices (owners can delete their own, admins can delete any)
CREATE POLICY "Owners can delete their devices"
    ON devices FOR DELETE
    TO authenticated
    USING (
        owner_user_id = auth.uid()
        AND org_id = public.user_org_id()
    );

CREATE POLICY "Admins can delete any device in their org"
    ON devices FOR DELETE
    TO authenticated
    USING (
        org_id = public.user_org_id()
        AND public.is_admin()
    );

-- 2. Also allow service_role to delete devices (for backend operations) 
CREATE POLICY "Service role can delete devices"
    ON devices FOR DELETE
    TO service_role
    USING (true);

-- 3. Add INSERT policy so authenticated users (not just admins) can register devices
-- The original schema required admin role; this lets any authenticated user create devices
DROP POLICY IF EXISTS "Users can insert devices in their org" ON devices;
CREATE POLICY "Users can insert devices in their org"
    ON devices FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.user_org_id() AND owner_user_id = auth.uid());

-- 4. Service role can insert devices (used by API route with service key)
CREATE POLICY "Service role can insert devices"
    ON devices FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 5. Update device_type CHECK constraint to include 'sonocardia-kit'
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_type_check;
ALTER TABLE devices ADD CONSTRAINT devices_device_type_check
    CHECK (device_type IN ('esp32', 'esp32-s3', 'esp32-c3', 'sonocardia-kit', 'custom'));

-- 6. Also allow service_role to insert audit logs (for API route logging)
CREATE POLICY "Authenticated users can insert audit logs"
    ON audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.user_org_id());

-- Done! Devices can now be deleted by their owners or admins.
