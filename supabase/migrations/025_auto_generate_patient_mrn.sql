-- AscultiCor Patient MRN Automation
-- Migration: 025_auto_generate_patient_mrn
-- Description: Generates patient medical record numbers automatically.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.generated_patient_mrn(
  patient_id UUID,
  created_at_value TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT AS $$
BEGIN
  RETURN 'AC-' ||
    to_char(COALESCE(created_at_value, NOW()), 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(patient_id::text, '-', ''), 1, 12));
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.set_patient_mrn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.created_at IS NULL THEN
    NEW.created_at := NOW();
  END IF;

  IF NEW.mrn IS NULL OR btrim(NEW.mrn) = '' THEN
    NEW.mrn := public.generated_patient_mrn(NEW.id, NEW.created_at);
  ELSE
    NEW.mrn := btrim(NEW.mrn);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patients_set_mrn ON public.patients;
CREATE TRIGGER patients_set_mrn
  BEFORE INSERT ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_patient_mrn();

UPDATE public.patients
SET mrn = public.generated_patient_mrn(id, created_at)
WHERE mrn IS NULL OR btrim(mrn) = '';

ALTER TABLE public.patients
  ALTER COLUMN mrn SET NOT NULL;

COMMENT ON COLUMN public.patients.mrn
IS 'System-generated medical record number. Generated automatically by patients_set_mrn when a patient is created.';
