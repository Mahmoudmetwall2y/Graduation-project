# Release Checklist (Demo-Ready Local Stack)

Use this checklist before any local demo or handoff.

## 1) Environment and secrets
- [ ] `.env` exists in repo root.
- [ ] Required Supabase keys are set: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Required broker values are set: `MQTT_USERNAME`, `MQTT_PASSWORD`.
- [ ] Internal tokens are set: `INTERNAL_API_TOKEN`, `INFERENCE_INTERNAL_TOKEN`.
- [ ] `LLM_PROVIDER=demo` unless a real provider integration is configured.

Quick check:
```bash
rg -n "^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|MQTT_USERNAME|MQTT_PASSWORD|INTERNAL_API_TOKEN|INFERENCE_INTERNAL_TOKEN|LLM_PROVIDER)=" .env
```

## 2) Database migrations and policies
- [ ] Existing DB upgrades were applied with numbered migrations through `023_delete_policies_for_sessions_and_patients.sql`.
- [ ] For fresh bootstrap only: `apply_this_in_supabase.sql` was used once.
- [ ] `devices` insert policy is admin-only.
- [ ] `llm_reports.requested_by` exists.

Policy sanity SQL:
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'devices'
ORDER BY policyname;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'llm_reports'
  AND column_name = 'requested_by';
```

## 3) Container health
- [ ] Stack starts without errors: `docker-compose up -d --build`.
- [ ] Broker, inference, and frontend are healthy.

Quick check:
```bash
docker-compose ps
curl -f http://localhost:8000/health
curl -f http://localhost:3000/api/health
```

## 4) Auth and provisioning checks
- [ ] Admin can create device and receives `device_id`, `device_secret`, `org_id`, `mqtt_user`, `mqtt_pass`.
- [ ] Non-admin receives HTTP `403` when creating a device.
- [ ] Non-admin Devices page does not show "Add Device" button.

## 5) Streaming and predictions
- [ ] Session is created from UI.
- [ ] Simulator runs with the exact full session UUID.
- [ ] Live waveform updates during streaming.
- [ ] Predictions appear after session completion.

Simulator command template:
```bash
cd simulator
py -3.11 demo_publisher.py --broker localhost --port 1883 --username <MQTT_USERNAME> --password <MQTT_PASSWORD> --org-id <ORG_ID> --device-id <DEVICE_ID> --session-id <FULL_SESSION_UUID>
```

## 6) LLM queue checks
- [ ] Queue request returns pending/queued response.
- [ ] Processing endpoint works with valid token.
- [ ] Invalid token for process endpoint returns `401`.

Process queue:
```bash
curl -X POST "http://localhost:3000/api/llm?action=process-pending" -H "x-internal-token: $INTERNAL_API_TOKEN"
```

## 7) Local quality gates
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `python -m compileall app` passes in `inference/`.

## 8) Documentation integrity
- [ ] `README.md` references valid local runbook/checklist docs.
- [ ] `DEMO_SCRIPT.md` references valid troubleshooting docs.
- [ ] `SUBMISSION_SUMMARY.md` references valid key docs.
