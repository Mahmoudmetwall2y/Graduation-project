-- =============================================================
-- COMBINED FIX: RLS helper functions + Migration 002
-- Run this in Supabase SQL Editor
-- =============================================================

-- Step 1: Create helper functions in PUBLIC schema (bypasses auth schema restrictions)
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID AS $$
    SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Step 2: Fix existing profiles RLS policy
DROP POLICY IF EXISTS "Users can view profiles in their org" ON profiles;
CREATE POLICY "Users can view profiles in their org"
    ON profiles FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

-- Fix existing devices RLS policy
DROP POLICY IF EXISTS "Users can view devices in their org" ON devices;
CREATE POLICY "Users can view devices in their org"
    ON devices FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

-- Fix existing sessions RLS policies
DROP POLICY IF EXISTS "Users can view sessions in their org" ON sessions;
CREATE POLICY "Users can view sessions in their org"
    ON sessions FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

-- Fix existing audit_logs RLS policy
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON audit_logs FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id() AND public.is_admin());

-- =============================================================
-- Step 3: Migration 002 - Device Management Enhancement
-- =============================================================

-- Device Groups for organizing multiple devices
CREATE TABLE IF NOT EXISTS device_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enhanced devices table with more metadata
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_group_id UUID REFERENCES device_groups(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type TEXT DEFAULT 'esp32' CHECK (device_type IN ('esp32', 'esp32-s3', 'esp32-c3', 'custom'));
ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_version TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error', 'maintenance'));
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level INTEGER CHECK (battery_level >= 0 AND battery_level <= 100);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS signal_strength INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS calibration_data JSONB;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sensor_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Device configuration/settings
CREATE TABLE IF NOT EXISTS device_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id, setting_key)
);

-- Device telemetry (health metrics)
CREATE TABLE IF NOT EXISTS device_telemetry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    temperature_celsius NUMERIC,
    uptime_seconds BIGINT,
    free_heap_bytes BIGINT,
    wifi_rssi INTEGER,
    battery_voltage NUMERIC,
    error_count INTEGER DEFAULT 0,
    telemetry_json JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LLM Reports for sessions
CREATE TABLE IF NOT EXISTS llm_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL DEFAULT 'gpt-4',
    model_version TEXT NOT NULL DEFAULT '2024-01',
    prompt_text TEXT NOT NULL,
    report_text TEXT NOT NULL,
    report_json JSONB,
    confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
    tokens_used INTEGER,
    latency_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Device recordings summary (aggregated data)
CREATE TABLE IF NOT EXISTS device_recording_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recording_date DATE NOT NULL,
    total_sessions INTEGER DEFAULT 0,
    total_recordings INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    pcg_normal_count INTEGER DEFAULT 0,
    pcg_murmur_count INTEGER DEFAULT 0,
    ecg_normal_count INTEGER DEFAULT 0,
    ecg_abnormal_count INTEGER DEFAULT 0,
    llm_reports_count INTEGER DEFAULT 0,
    summary_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id, recording_date)
);

-- Device alerts/notifications
CREATE TABLE IF NOT EXISTS device_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('offline', 'low_battery', 'error', 'anomaly_detected', 'maintenance_required')),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT NOT NULL,
    metadata JSONB,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Device API Keys for authentication
CREATE TABLE IF NOT EXISTS device_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES profiles(id)
);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_device_groups_org ON device_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(device_group_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_device_settings_device ON device_settings(device_id);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_device ON device_telemetry(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_org ON device_telemetry(org_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_reports_session ON llm_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_llm_reports_device ON llm_reports(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_reports_status ON llm_reports(status);
CREATE INDEX IF NOT EXISTS idx_recording_summaries_device ON device_recording_summaries(device_id, recording_date DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_device ON device_alerts(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_unresolved ON device_alerts(device_id, is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_device_api_keys_device ON device_api_keys(device_id);

-- =============================================================
-- RLS POLICIES (using public.user_org_id / public.is_admin)
-- =============================================================

ALTER TABLE device_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_recording_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_api_keys ENABLE ROW LEVEL SECURITY;

-- Device Groups policies
DROP POLICY IF EXISTS "Users can view device groups in their org" ON device_groups;
CREATE POLICY "Users can view device groups in their org"
    ON device_groups FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Admins can manage device groups" ON device_groups;
CREATE POLICY "Admins can manage device groups"
    ON device_groups FOR ALL
    TO authenticated
    USING (org_id = public.user_org_id() AND public.is_admin());

-- Device Settings policies
DROP POLICY IF EXISTS "Users can view device settings in their org" ON device_settings;
CREATE POLICY "Users can view device settings in their org"
    ON device_settings FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM devices d 
        WHERE d.id = device_settings.device_id 
        AND d.org_id = public.user_org_id()
    ));

DROP POLICY IF EXISTS "Service role can manage device settings" ON device_settings;
CREATE POLICY "Service role can manage device settings"
    ON device_settings FOR ALL
    TO service_role
    USING (true);

-- Device Telemetry policies
DROP POLICY IF EXISTS "Users can view telemetry in their org" ON device_telemetry;
CREATE POLICY "Users can view telemetry in their org"
    ON device_telemetry FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Service role can insert telemetry" ON device_telemetry;
CREATE POLICY "Service role can insert telemetry"
    ON device_telemetry FOR INSERT
    TO service_role
    WITH CHECK (true);

-- LLM Reports policies
DROP POLICY IF EXISTS "Users can view LLM reports in their org" ON llm_reports;
CREATE POLICY "Users can view LLM reports in their org"
    ON llm_reports FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Service role can insert LLM reports" ON llm_reports;
CREATE POLICY "Service role can insert LLM reports"
    ON llm_reports FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Device Recording Summaries policies
DROP POLICY IF EXISTS "Users can view summaries in their org" ON device_recording_summaries;
CREATE POLICY "Users can view summaries in their org"
    ON device_recording_summaries FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Service role can manage summaries" ON device_recording_summaries;
CREATE POLICY "Service role can manage summaries"
    ON device_recording_summaries FOR ALL
    TO service_role
    USING (true);

-- Device Alerts policies
DROP POLICY IF EXISTS "Users can view alerts in their org" ON device_alerts;
CREATE POLICY "Users can view alerts in their org"
    ON device_alerts FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Users can resolve alerts in their org" ON device_alerts;
CREATE POLICY "Users can resolve alerts in their org"
    ON device_alerts FOR UPDATE
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Service role can create alerts" ON device_alerts;
CREATE POLICY "Service role can create alerts"
    ON device_alerts FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Device API Keys policies
DROP POLICY IF EXISTS "Admins can view API keys in their org" ON device_api_keys;
CREATE POLICY "Admins can view API keys in their org"
    ON device_api_keys FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS "Admins can manage API keys" ON device_api_keys;
CREATE POLICY "Admins can manage API keys"
    ON device_api_keys FOR ALL
    TO authenticated
    USING (org_id = public.user_org_id() AND public.is_admin());

-- =============================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================

CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE devices 
    SET last_seen_at = NEW.recorded_at,
        status = 'online'
    WHERE id = NEW.device_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS device_telemetry_update_last_seen ON device_telemetry;
CREATE TRIGGER device_telemetry_update_last_seen
    AFTER INSERT ON device_telemetry
    FOR EACH ROW
    EXECUTE FUNCTION update_device_last_seen();

CREATE OR REPLACE FUNCTION update_recording_summary()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO device_recording_summaries (
        device_id, org_id, recording_date, total_sessions
    )
    VALUES (
        NEW.device_id, NEW.org_id, DATE(NEW.created_at), 1
    )
    ON CONFLICT (device_id, recording_date)
    DO UPDATE SET
        total_sessions = device_recording_summaries.total_sessions + 1,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_completion_summary ON sessions;
CREATE TRIGGER session_completion_summary
    AFTER UPDATE OF status ON sessions
    FOR EACH ROW
    WHEN (NEW.status = 'done')
    EXECUTE FUNCTION update_recording_summary();

-- Done!

-- =============================================================
-- Step 4: Professional hardening fixes
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_time_order_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_time_order_check
  CHECK (ended_at IS NULL OR ended_at >= started_at);

ALTER TABLE recordings
  DROP CONSTRAINT IF EXISTS recordings_duration_non_negative_check;
ALTER TABLE recordings
  ADD CONSTRAINT recordings_duration_non_negative_check
  CHECK (duration_sec IS NULL OR duration_sec >= 0);

ALTER TABLE predictions
  DROP CONSTRAINT IF EXISTS predictions_latency_non_negative_check;
ALTER TABLE predictions
  ADD CONSTRAINT predictions_latency_non_negative_check
  CHECK (latency_ms IS NULL OR latency_ms >= 0);

ALTER TABLE llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_latency_non_negative_check;
ALTER TABLE llm_reports
  ADD CONSTRAINT llm_reports_latency_non_negative_check
  CHECK (latency_ms IS NULL OR latency_ms >= 0);

ALTER TABLE llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_tokens_non_negative_check;
ALTER TABLE llm_reports
  ADD CONSTRAINT llm_reports_tokens_non_negative_check
  CHECK (tokens_used IS NULL OR tokens_used >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS ux_devices_org_device_name
  ON devices (org_id, device_name);

CREATE UNIQUE INDEX IF NOT EXISTS ux_llm_reports_completed_per_model
  ON llm_reports (session_id, model_name, model_version)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_recordings_org_created
  ON recordings (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_predictions_org_created
  ON predictions (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_reports_org_created
  ON llm_reports (org_id, created_at DESC);

DROP POLICY IF EXISTS "Users can view LLM reports in their org" ON llm_reports;
DROP POLICY IF EXISTS "Service role can insert LLM reports" ON llm_reports;
DROP POLICY IF EXISTS "Users can insert LLM reports in their org" ON llm_reports;
DROP POLICY IF EXISTS "Users can update LLM reports in their org" ON llm_reports;
DROP POLICY IF EXISTS "Service role can manage LLM reports" ON llm_reports;

CREATE POLICY "Users can view LLM reports in their org"
  ON llm_reports FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Users can insert LLM reports in their org"
  ON llm_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND EXISTS (
      SELECT 1
      FROM sessions s
      WHERE s.id = session_id
        AND s.org_id = public.user_org_id()
        AND s.device_id = llm_reports.device_id
    )
  );

CREATE POLICY "Users can update LLM reports in their org"
  ON llm_reports FOR UPDATE
  TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

CREATE POLICY "Service role can manage LLM reports"
  ON llm_reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION generate_device_api_key(
  device_uuid UUID,
  created_by_uuid UUID DEFAULT auth.uid()
)
RETURNS TEXT AS $$
DECLARE
  new_key TEXT;
  hashed_key TEXT;
BEGIN
  IF created_by_uuid IS NULL THEN
    RAISE EXCEPTION 'created_by_uuid cannot be null';
  END IF;

  new_key := 'ac_' || encode(gen_random_bytes(32), 'hex');
  hashed_key := crypt(new_key, gen_salt('bf'));

  INSERT INTO device_api_keys (device_id, org_id, key_hash, key_prefix, name, created_by)
  SELECT d.id, d.org_id, hashed_key, left(new_key, 10), 'Auto-generated key', created_by_uuid
  FROM devices d
  WHERE d.id = device_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device % not found', device_uuid;
  END IF;

  RETURN new_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS session_completion_summary ON sessions;
CREATE TRIGGER session_completion_summary
  AFTER UPDATE OF status ON sessions
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_recording_summary();

-- =============================================================
-- Step 5: LLM queue retry hardening
-- =============================================================

ALTER TABLE llm_reports
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_retry_count_non_negative_check;
ALTER TABLE llm_reports
  ADD CONSTRAINT llm_reports_retry_count_non_negative_check
  CHECK (retry_count >= 0);

ALTER TABLE llm_reports
  DROP CONSTRAINT IF EXISTS llm_reports_max_retries_non_negative_check;
ALTER TABLE llm_reports
  ADD CONSTRAINT llm_reports_max_retries_non_negative_check
  CHECK (max_retries >= 0);

CREATE INDEX IF NOT EXISTS idx_llm_reports_retry_ready
  ON llm_reports (status, next_retry_at, created_at)
  WHERE status = 'pending';

-- =============================================================
-- Step 6: Patient management
-- =============================================================

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    dob DATE,
    sex TEXT CHECK (sex IN ('female', 'male', 'other', 'unknown')) DEFAULT 'unknown',
    mrn TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_org_created
    ON patients (org_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_patients_org_mrn
    ON patients (org_id, mrn)
    WHERE mrn IS NOT NULL;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_patient
    ON sessions (patient_id);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view patients in their org" ON patients;
CREATE POLICY "Users can view patients in their org"
    ON patients FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Users can insert patients in their org" ON patients;
CREATE POLICY "Users can insert patients in their org"
    ON patients FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.user_org_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update patients they created" ON patients;
CREATE POLICY "Users can update patients they created"
    ON patients FOR UPDATE
    TO authenticated
    USING (org_id = public.user_org_id() AND created_by = auth.uid())
    WITH CHECK (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Admins can update any patient" ON patients;
CREATE POLICY "Admins can update any patient"
    ON patients FOR UPDATE
    TO authenticated
    USING (org_id = public.user_org_id() AND public.is_admin())
    WITH CHECK (org_id = public.user_org_id() AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete patients in their org" ON patients;
CREATE POLICY "Admins can delete patients in their org"
    ON patients FOR DELETE
    TO authenticated
    USING (org_id = public.user_org_id() AND public.is_admin());

-- =============================================================
-- Step 7: Session notes
-- =============================================================

CREATE TABLE IF NOT EXISTS session_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session_created
    ON session_notes (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_notes_org_created
    ON session_notes (org_id, created_at DESC);

ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view session notes in their org" ON session_notes;
CREATE POLICY "Users can view session notes in their org"
    ON session_notes FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Users can insert session notes in their org" ON session_notes;
CREATE POLICY "Users can insert session notes in their org"
    ON session_notes FOR INSERT
    TO authenticated
    WITH CHECK (
        org_id = public.user_org_id()
        AND author_id = auth.uid()
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
    USING (org_id = public.user_org_id() AND author_id = auth.uid());

-- =============================================================
-- Step 8: Saved views (sessions)
-- =============================================================

CREATE TABLE IF NOT EXISTS saved_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    view_type TEXT NOT NULL CHECK (view_type IN ('sessions')),
    name TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_org_user
    ON saved_views (org_id, user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_saved_views_user_name_type
    ON saved_views (org_id, user_id, view_type, name);

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their saved views" ON saved_views;
CREATE POLICY "Users can view their saved views"
    ON saved_views FOR SELECT
    TO authenticated
    USING (org_id = public.user_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their saved views" ON saved_views;
CREATE POLICY "Users can insert their saved views"
    ON saved_views FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.user_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their saved views" ON saved_views;
CREATE POLICY "Users can delete their saved views"
    ON saved_views FOR DELETE
    TO authenticated
    USING (org_id = public.user_org_id() AND user_id = auth.uid());

-- =============================================================
-- Step 12: Audit log insert policy
-- =============================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert audit logs in their org" ON audit_logs;
CREATE POLICY "Users can insert audit logs in their org"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.user_org_id() AND user_id = auth.uid());

-- =============================================================
-- Step 13: Roles & permissions
-- =============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'admin', 'clinician', 'readonly'));

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- Devices
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

-- Sessions
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

-- Patients
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

-- Session notes
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

-- Saved views
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

-- =============================================================
-- Step 17: Org settings for retention and de-identification
-- =============================================================

CREATE TABLE IF NOT EXISTS org_settings (
    org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days >= 0),
    deidentify_exports BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org settings" ON org_settings;
CREATE POLICY "Users can view org settings"
  ON org_settings FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "Admins can manage org settings" ON org_settings;
CREATE POLICY "Admins can manage org settings"
  ON org_settings FOR ALL
  TO authenticated
  USING (org_id = public.user_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.user_org_id() AND public.is_admin());
