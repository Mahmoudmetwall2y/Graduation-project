# AscultiCor Release Checklist

Use this checklist before a graduation demo, local handoff, or future VPS deployment.
Do not deploy from a machine that has not passed the local checks.

## Secrets and Environment

- [ ] No plaintext `env` file exists in the repository root.
- [ ] `.env` is local-only and is not committed.
- [ ] `.env.cloud.example` contains placeholders only.
- [ ] `INTERNAL_API_TOKEN`, `INFERENCE_INTERNAL_TOKEN`, MQTT passwords, Supabase service role key, n8n password, and n8n encryption key are rotated before public deployment.
- [ ] `N8N_EMAIL_PAYLOAD_EXPORT_ENABLED=false` unless a trusted email workflow explicitly needs generated report bodies.

## Local Verification

- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/security-smoke.ps1` passes locally.
- [ ] `cd frontend && npm ci && npm run lint && npm run typecheck && npm run build` passes.
- [ ] `cd inference && python -m pip install -r requirements.txt && python -m compileall app` passes.
- [ ] Docker stack starts with `docker compose --env-file .env up --build -d`.
- [ ] Public `/api/health` returns only minimal status.
- [ ] Detailed `/api/health?details=1` works only with `x-internal-token`.

## Database

- [ ] Numbered migrations are applied in order through `026_device_mqtt_credentials.sql`.
- [ ] `apply_this_in_supabase.sql` is used only as a fresh-database snapshot.
- [ ] RLS remains enabled on tenant data tables.
- [ ] Storage bucket `recordings` is private.
- [ ] Signed upload/download functions verify organization and session/recording ownership.

## Future Hostinger VPS Readiness

- [ ] No deployment is performed until the local checklist passes.
- [ ] MQTT TCP is loopback/private unless protected by TLS, VPN, or a private network.
- [ ] NGINX does not publicly proxy `/api/inference/`.
- [ ] n8n is protected by authentication and an encryption key.
- [ ] Firewall exposes only the intended public ports.

---

## ML Models (Critical for Live Demo)

- [ ] All 3 model directories exist with required files (see README for full list).
- [ ] **ECG_SAMPLE_RATE=360 and ECG_WINDOW_SIZE=300** — must match BiLSTM MIT-BIH training config.
- [ ] Inference `/health` reports `models_loaded: 3` (not demo mode).
- [ ] At least one test prediction runs end-to-end before demo.
- [ ] Training confusion matrices and accuracy scores are documented for defense.

## Hardware (for Live Demo)

- [ ] ESP32 firmware flashed with latest version.
- [ ] Device provisioned with MQTT credentials via Serial Monitor.
- [ ] Device shows "online" status in dashboard before demo starts.
- [ ] Backup: pre-recorded demo video ready in case hardware fails.

## Frontend

- [ ] Login works with demo admin account.
- [ ] Dashboard loads with real or seeded session data.
- [ ] 3D heart visualization renders without JavaScript errors.
- [ ] Report generation works (or demo mode shows template report).
- [ ] No console errors in browser devtools during demo flow.

## Graduation Defense Preparation

- [ ] Defense Q&A answers prepared (why MQTT, why Supabase, RLS explanation, AAMI classification).
- [ ] "Limitations and Future Work" slide prepared (MQTT TLS, in-memory rate limiter, horizontal scaling).
- [ ] Architecture diagram shown in presentation (ESP32 → MQTT → FastAPI → Supabase → Next.js).
- [ ] Multi-tenancy demo: show RLS blocking cross-org access.
- [ ] Dataset citations ready: PhysioNet CirCor 2022, MIT-BIH Arrhythmia Database.
