CREATE TABLE public.firmware_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL DEFAULT 'stable'
    CHECK (channel IN ('development', 'candidate', 'stable')),
  hardware_model TEXT NOT NULL DEFAULT 'esp32-wroom-32',
  binary_path TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  binary_size_bytes BIGINT NOT NULL CHECK (binary_size_bytes > 0),
  release_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX firmware_releases_one_active_per_target
  ON public.firmware_releases (channel, hardware_model)
  WHERE is_active;

CREATE TABLE public.firmware_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.firmware_releases(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'dispatched', 'downloading', 'installing', 'rebooting', 'succeeded', 'failed', 'cancelled')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX firmware_deployments_queue
  ON public.firmware_deployments (status, requested_at)
  WHERE status IN ('queued', 'dispatched', 'downloading', 'installing', 'rebooting');

CREATE INDEX firmware_deployments_device_history
  ON public.firmware_deployments (device_id, requested_at DESC);

ALTER TABLE public.firmware_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmware_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active firmware releases"
  ON public.firmware_releases FOR SELECT
  TO authenticated
  USING (is_active OR public.is_admin());

CREATE POLICY "Admins can manage firmware releases"
  ON public.firmware_releases FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users can view firmware deployments in their organization"
  ON public.firmware_deployments FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Admins can create firmware deployments in their organization"
  ON public.firmware_deployments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    AND org_id = public.user_org_id()
    AND requested_by = (SELECT auth.uid())
  );

CREATE POLICY "Admins can cancel queued firmware deployments"
  ON public.firmware_deployments FOR UPDATE
  TO authenticated
  USING (public.is_admin() AND org_id = public.user_org_id())
  WITH CHECK (public.is_admin() AND org_id = public.user_org_id());

GRANT SELECT ON public.firmware_releases TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.firmware_deployments TO authenticated;
GRANT ALL ON public.firmware_releases TO service_role;
GRANT ALL ON public.firmware_deployments TO service_role;

COMMENT ON TABLE public.firmware_releases IS
  'Immutable ESP32 application firmware metadata used for verified OTA delivery.';
COMMENT ON TABLE public.firmware_deployments IS
  'Auditable per-device OTA rollout state orchestrated by n8n.';
