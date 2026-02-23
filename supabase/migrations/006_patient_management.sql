-- AscultiCor Patient Management
-- Migration: 006_patient_management.sql
-- Description: Adds patients table and links sessions to patients.

-- ============================================================
-- PATIENTS TABLE
-- ============================================================

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

-- ============================================================
-- SESSIONS LINK
-- ============================================================

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_patient
    ON sessions (patient_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

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
