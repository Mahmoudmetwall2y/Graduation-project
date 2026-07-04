-- AscultiCor Device Name Uniqueness
-- Migration: 028_device_name_unique_per_org.sql
-- Description: Prevents two devices in the same organization from having the same name.
--              Duplicate names cause UI confusion and potential session routing errors.

ALTER TABLE devices
  ADD CONSTRAINT IF NOT EXISTS ux_devices_org_device_name
  UNIQUE (org_id, device_name);

COMMENT ON CONSTRAINT ux_devices_org_device_name ON devices
IS 'Device names must be unique within an organization to prevent confusion in session routing.';
