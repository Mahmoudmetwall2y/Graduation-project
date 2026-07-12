# AscultiCor Release Checklist

Use this checklist before a demonstration, release handoff, or server deployment.

## Secrets and environment

- [ ] No real `.env`, certificate, key, Terraform state, or backup is tracked.
- [ ] Internal API, inference, MQTT, Supabase, and n8n credentials are strong and independent.
- [ ] Public environment variables contain no secrets.
- [ ] Production credentials have been rotated from development values.

## Verification

- [ ] Security smoke checks pass.
- [ ] Frontend lint, typecheck, and production build pass.
- [ ] Inference and simulator tests pass.
- [ ] The Docker stack starts cleanly and health endpoints behave as documented.

## Data and access control

- [ ] Numbered migrations are applied in order.
- [ ] RLS is enabled and cross-organization access tests fail as expected.
- [ ] Private storage requires authorized signed URLs.
- [ ] Seed records contain no personal information.
- [ ] Backup restoration has been tested.

## Models and hardware

- [ ] Required models, encoders, scalers, and configurations are present.
- [ ] Model input contracts and validation checks pass.
- [ ] Model limitations and evaluation evidence are documented.
- [ ] Firmware, provisioning, sampling, MQTT, and sessions work on a test device.
- [ ] OTA checksum, staged rollout, and serial recovery paths are verified.

## Deployment

- [ ] HTTPS and remote MQTT TLS use trusted certificates.
- [ ] Only required firewall ports are exposed.
- [ ] Nginx does not expose internal inference routes.
- [ ] n8n requires authentication and uses an encryption key.
- [ ] Logs contain no credentials or sensitive payloads.
- [ ] Monitoring, recovery, rollback, and incident-response owners are known.

## Final acceptance

- [ ] Login, patient, device, session, prediction, report, and audit workflows pass.
- [ ] A multi-tenant test confirms organization isolation.
- [ ] Known limitations and non-diagnostic status are visible.
- [ ] Dataset and model provenance are recorded.
- [ ] The release version and deployment commit are recorded.
