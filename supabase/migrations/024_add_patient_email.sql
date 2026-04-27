-- AscultiCor Patient Email
-- Migration: 024_add_patient_email
-- Description: Adds optional patient email for n8n notifications and report delivery.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_email_format_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_email_format_check
  CHECK (
    email IS NULL
    OR email = ''
    OR email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );

CREATE INDEX IF NOT EXISTS idx_patients_org_email
  ON public.patients (org_id, lower(email))
  WHERE email IS NOT NULL;

COMMENT ON COLUMN public.patients.email
IS 'Optional patient email used by n8n workflows for notifications and generated report delivery.';
