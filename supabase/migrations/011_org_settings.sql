-- AscultiCor Org Settings
-- Migration: 011_org_settings.sql
-- Description: Adds org-level settings for retention and de-identification.

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
