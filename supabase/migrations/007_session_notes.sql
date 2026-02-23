-- AscultiCor Session Notes
-- Migration: 007_session_notes.sql
-- Description: Adds clinician notes per session with RLS policies.

-- ============================================================
-- SESSION NOTES TABLE
-- ============================================================

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

-- ============================================================
-- RLS POLICIES
-- ============================================================

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
