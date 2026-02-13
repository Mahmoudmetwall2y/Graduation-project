-- AscultiCor Database Schema
-- Migration: 001_initial_schema.sql
-- Description: Creates core tables with RLS policies for multi-tenant architecture

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Organizations table (root of multi-tenancy)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('operator', 'admin')) DEFAULT 'operator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Devices table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    device_secret_hash TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('created', 'streaming', 'processing', 'done', 'error')) DEFAULT 'created',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recordings table
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    modality TEXT NOT NULL CHECK (modality IN ('pcg', 'ecg')),
    valve_position TEXT CHECK (valve_position IN ('AV', 'MV', 'PV', 'TV')),
    sample_rate_hz INTEGER NOT NULL,
    duration_sec NUMERIC,
    storage_path TEXT NOT NULL,
    checksum TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Predictions table
CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    modality TEXT NOT NULL CHECK (modality IN ('pcg', 'ecg')),
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    preprocessing_version TEXT NOT NULL,
    output_json JSONB NOT NULL,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Murmur severity table (only populated when PCG == Murmur)
CREATE TABLE murmur_severity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    preprocessing_version TEXT NOT NULL,
    location_json JSONB NOT NULL,
    timing_json JSONB NOT NULL,
    shape_json JSONB NOT NULL,
    grading_json JSONB NOT NULL,
    pitch_json JSONB NOT NULL,
    quality_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Live metrics table (low-rate updates)
CREATE TABLE live_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    metrics_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID,
    user_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_profiles_org_id ON profiles(org_id);
CREATE INDEX idx_devices_org_id ON devices(org_id, last_seen_at DESC);
CREATE INDEX idx_devices_owner ON devices(owner_user_id);

CREATE INDEX idx_sessions_org_created ON sessions(org_id, created_at DESC);
CREATE INDEX idx_sessions_device ON sessions(device_id);
CREATE INDEX idx_sessions_status ON sessions(status, created_at DESC);

CREATE INDEX idx_recordings_session ON recordings(session_id, created_at DESC);
CREATE INDEX idx_predictions_session ON predictions(session_id, created_at DESC);
CREATE INDEX idx_murmur_session ON murmur_severity(session_id);
CREATE INDEX idx_live_metrics_session ON live_metrics(session_id, created_at DESC);

CREATE INDEX idx_audit_logs_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get user's org_id
CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID AS $$
    SELECT org_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
    SELECT role = 'admin' FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE murmur_severity ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    TO authenticated
    USING (id = auth.user_org_id());

-- Profiles policies
CREATE POLICY "Users can view profiles in their org"
    ON profiles FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id());

CREATE POLICY "Admins can insert profiles in their org"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (org_id = auth.user_org_id() AND auth.is_admin());

CREATE POLICY "Admins can update profiles in their org"
    ON profiles FOR UPDATE
    TO authenticated
    USING (org_id = auth.user_org_id() AND auth.is_admin());

-- Devices policies
CREATE POLICY "Users can view devices in their org"
    ON devices FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id());

CREATE POLICY "Operators can insert their own devices"
    ON devices FOR INSERT
    TO authenticated
    WITH CHECK (org_id = auth.user_org_id() AND owner_user_id = auth.uid());

CREATE POLICY "Admins can insert any device in their org"
    ON devices FOR INSERT
    TO authenticated
    WITH CHECK (org_id = auth.user_org_id() AND auth.is_admin());

CREATE POLICY "Owners can update their devices"
    ON devices FOR UPDATE
    TO authenticated
    USING (owner_user_id = auth.uid());

CREATE POLICY "Admins can update any device in their org"
    ON devices FOR UPDATE
    TO authenticated
    USING (org_id = auth.user_org_id() AND auth.is_admin());

-- Sessions policies
CREATE POLICY "Users can view sessions in their org"
    ON sessions FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id());

CREATE POLICY "Users can insert sessions in their org"
    ON sessions FOR INSERT
    TO authenticated
    WITH CHECK (org_id = auth.user_org_id() AND created_by = auth.uid());

CREATE POLICY "Users can update their own sessions"
    ON sessions FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

-- Service role can update any session
CREATE POLICY "Service role can update sessions"
    ON sessions FOR UPDATE
    TO service_role
    USING (true);

-- Recordings policies
CREATE POLICY "Users can view recordings in their org"
    ON recordings FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id());

-- Service role inserts recordings
CREATE POLICY "Service role can insert recordings"
    ON recordings FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Predictions policies
CREATE POLICY "Users can view predictions in their org"
    ON predictions FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id());

-- Service role inserts predictions
CREATE POLICY "Service role can insert predictions"
    ON predictions FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Murmur severity policies
CREATE POLICY "Users can view murmur severity in their org"
    ON murmur_severity FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id());

-- Service role inserts murmur severity
CREATE POLICY "Service role can insert murmur severity"
    ON murmur_severity FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Live metrics policies
CREATE POLICY "Users can view live metrics in their org"
    ON live_metrics FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id());

-- Service role inserts live metrics
CREATE POLICY "Service role can insert live metrics"
    ON live_metrics FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Audit logs policies
CREATE POLICY "Admins can view audit logs in their org"
    ON audit_logs FOR SELECT
    TO authenticated
    USING (org_id = auth.user_org_id() AND auth.is_admin());

CREATE POLICY "Service role can insert audit logs"
    ON audit_logs FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- Create recordings bucket (executed via Supabase dashboard or API)
-- This is a note for manual setup:
-- Bucket name: recordings
-- Privacy: Private
-- File size limit: 50 MB
-- Allowed MIME types: audio/*, application/octet-stream

-- Storage policies will be applied via Supabase dashboard:
-- SELECT: Users can view files in their org path
-- INSERT: Service role only
-- UPDATE: Service role only
-- DELETE: Admins only

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================

-- Enable realtime for tables that need live updates
-- Note: This must be done via Supabase dashboard or API
-- Tables to enable:
-- - sessions
-- - predictions
-- - murmur_severity
-- - live_metrics
-- - devices (for last_seen_at updates)

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE organizations IS 'Root multi-tenant organizations';
COMMENT ON TABLE profiles IS 'User profiles with roles (operator, admin)';
COMMENT ON TABLE devices IS 'Registered ESP32 devices';
COMMENT ON TABLE sessions IS 'Recording sessions with status tracking';
COMMENT ON TABLE recordings IS 'Raw signal storage metadata';
COMMENT ON TABLE predictions IS 'ML inference results';
COMMENT ON TABLE murmur_severity IS 'Detailed murmur analysis (6 heads)';
COMMENT ON TABLE live_metrics IS 'Real-time quality metrics during streaming';
COMMENT ON TABLE audit_logs IS 'Security and compliance audit trail';
