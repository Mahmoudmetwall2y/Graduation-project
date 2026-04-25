-- Per-device MQTT credentials for broker ACL isolation.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS mqtt_username TEXT,
  ADD COLUMN IF NOT EXISTS mqtt_password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_mqtt_username
  ON devices (mqtt_username)
  WHERE mqtt_username IS NOT NULL;

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_mqtt_credentials_pair_check;

ALTER TABLE devices
  ADD CONSTRAINT devices_mqtt_credentials_pair_check
  CHECK (
    (mqtt_username IS NULL AND mqtt_password_hash IS NULL)
    OR
    (mqtt_username IS NOT NULL AND mqtt_password_hash IS NOT NULL)
  );
