-- AscultiCor Saved Views
-- Migration: 008_saved_views.sql
-- Description: Stores per-user saved filter presets.

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
