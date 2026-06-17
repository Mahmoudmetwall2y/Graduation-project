# AscultiCor Full Repository Audit

Date: 2026-06-15  
Scope: local development repository with Hostinger VPS migration target.  
Audit basis: static source inspection plus feasible local commands. No real ESP32, Supabase project, Docker daemon, or running services were available in this environment.

## A. Executive Summary

- **Verified - Blocker:** Supabase migrations contain duplicate numeric prefix `025`: `025_auto_generate_patient_mrn.sql` and `025_visitor_role.sql`. The repository's own `scripts/security-smoke.ps1` fails with `Duplicate numbered migrations found: 025`. This blocks clean CI and migration confidence.
- **Verified - High:** The real hardware MQTT topic contract is mostly aligned. Firmware publishes `org/{org_id}/device/{device_id}/session/{session_id}/{meta|pcg|ecg|heartbeat}` in `firmware/asculticor_esp32/AscultiCor_esp32.ino`; inference subscribes to the same patterns in `inference/app/mqtt_handler.py`.
- **Verified - High:** Local defaults intentionally bind MQTT to `127.0.0.1` in `.env.example` and `docker-compose.yml`. That is safe for local-only development but blocks ESP32 hardware unless changed to a LAN-reachable address or proxied/tunneled.
- **Verified - High:** `.env.cloud.example` sets `ECG_SAMPLE_RATE=500` and `ECG_WINDOW_SIZE=500`, while `inference/app/inference.py`, `.env.example`, and `docker-compose.yml` document/use MIT-BIH-compatible `360 Hz` and `300` sample windows. This can break or degrade ECG inference on Hostinger.
- **Verified - High:** `/api/device/bootstrap` validates `device_id` and bcrypt `device_secret_hash`, then returns MQTT credentials. It rate-limits in memory only, so repeated attempts are not globally limited across restarts or multiple instances.
- **Verified - High:** LLM report processing is asynchronous and token-protected, but `frontend/src/app/api/llm/route.ts` silently falls back from Claude or unsupported providers to the demo template. This must be visibly labeled in reports and demo scripts.
- **Verified - Medium:** `supabase/seed.sql` contains demo organization/profile/device metadata and a documented `demo_secret_2024`; README says it does not create Supabase Auth users. It is optional seed data, not the main runtime path.
- **Verified - Medium:** Some UI wording overclaims medically: `Model1StateCard` comments say "primary diagnosis", session report heading says "Diagnostic Report", and Model 2 component is named/displayed as "Diagnostic". This should be softened to educational analysis/review wording.
- **Verified - Medium:** Public `/api/health` returns only `{ status: "healthy" }` unless `?details=1` plus `x-internal-token` is used. Good for secrecy, but not sufficient as a public readiness signal.
- **Verified - Medium:** `docs/HOSTINGER_VPS_DEPLOYMENT.md` contains broken absolute local links pointing at `/d:/cardiosense-project/cardiosense/...` instead of relative repo paths.
- **Verified - Medium:** n8n workflows default to Docker-internal `http://frontend:3000`, which is correct inside Compose, but Hostinger public URLs must be configured for browser/webhook-facing flows.
- **Verified - Low:** Node is installed, but dependencies are not installed in `frontend/node_modules`; `npm.cmd run typecheck` and `npm.cmd run lint` fail because `tsc` and `next` are not found. This is local setup state, not necessarily source failure.
- **Verified - Low:** Python and Docker CLIs are not available on this machine, so Python compile and Docker Compose validation could not be executed locally.

## B. Repository Coverage Matrix

| Layer | Expected from project description | Verified in repository | Status | Evidence | Priority |
|---|---|---|---|---|---|
| Frontend | Next.js 14 dashboard, routes, API routes | Present | Verified | `frontend/src/app`, `frontend/package.json` | High |
| Firmware | ESP32 AD8232/MAX9814 real capture | Present | Verified | `firmware/asculticor_esp32/AscultiCor_esp32.ino` | High |
| MQTT broker | Mosquitto auth/ACL | Present | Verified | `mosquitto/config/mosquitto.conf`, `mosquitto/scripts/sync_device_credentials.py` | High |
| Inference | FastAPI MQTT subscriber and ML pipeline | Present | Verified | `inference/app/main.py`, `mqtt_handler.py`, `inference.py` | High |
| Models | 3 model artifact groups | Present | Verified | `models/model1_xgboost`, `models/model2_cnn_severity`, `models/model3_bilstm_ecg` | High |
| Supabase | migrations, RLS, functions | Present with duplicate migration number | Risk | `supabase/migrations/025_*`, `security-smoke.ps1` | Blocker |
| n8n | workflow exports | Present | Verified | `n8n/workflows/*.json`, `frontend/src/app/api/n8n/workflows/route.ts` | Medium |
| Deployment | Docker, NGINX, Hostinger docs | Present with config risks | Partially verified | `docker-compose.yml`, `.env.cloud.example`, `docs/HOSTINGER_VPS_DEPLOYMENT.md` | High |
| Tests/CI | CI, lint, typecheck, compile | CI present; local checks blocked/failing | Risk | `.github/workflows/ci.yml`, local command results | High |
| Documentation | README/runbooks/cloud docs | Present, some stale links | Partially verified | `README.md`, `docs/*` | Medium |

## C. Complete Route/API Inventory

### 1. Frontend Pages

| Route | File | Status | Data sources | Protection/notes |
|---|---|---|---|---|
| `/` | `frontend/src/app/page.tsx` | Verified | Static/landing UI | Public |
| `/auth/login` | `frontend/src/app/auth/login/page.tsx` | Verified | Supabase Auth | Public auth route |
| `/dashboard` | `frontend/src/app/dashboard/page.tsx` | Verified | Supabase tables, `/api/devices`, `/api/health` | Client-side admin role check; non-admin redirects to `/sessions` |
| `/devices` | `frontend/src/app/devices/page.tsx` | Verified | `/api/devices` | Device creation gated by API/admin role |
| `/devices/[id]` | `frontend/src/app/devices/[id]/page.tsx` | Verified | Supabase/API | Dynamic route present |
| `/patients` | `frontend/src/app/patients/page.tsx` | Verified | Supabase `patients`, `profiles` | Client-side role/ownership checks |
| `/sessions` | `frontend/src/app/sessions/page.tsx` | Verified | Supabase `sessions`, `devices`, `patients`, `saved_views`, `predictions` | Protected by middleware |
| `/session/new` | `frontend/src/app/session/new/page.tsx` | Verified | Supabase/API | Protected by middleware |
| `/session/[id]` | `frontend/src/app/session/[id]/page.tsx` | Verified | `/api/sessions/[id]/summary`, `/api/sessions/[id]/live`, `/api/sessions/[id]/stream` | Real live/replay path from Supabase metrics/recordings |
| `/reports` | `frontend/src/app/reports/page.tsx` | Verified | Supabase sessions/patients/recordings/predictions | Contains "functional demo" PDF export comment |
| `/alerts` | `frontend/src/app/alerts/page.tsx` | Verified | Supabase `device_alerts` | Admin-only redirect client-side |
| `/settings` | `frontend/src/app/settings/page.tsx` | Verified | Supabase `profiles`, `organizations`, `org_settings` | Has "Preferences Mock State" comment |
| `/admin` | `frontend/src/app/admin/page.tsx` | Verified | Supabase counts/audit logs | Client-side admin check |
| `/admin/audit` | `frontend/src/app/admin/audit/page.tsx` | Verified | Supabase audit logs | Should be checked server-side/API-side for admin if exposed through APIs |

### 2. Next.js API Routes

| API route | File | Methods | Status | Key security behavior |
|---|---|---:|---|---|
| `/api/device/bootstrap` | `frontend/src/app/api/device/bootstrap/route.ts` | POST | Verified | Service role; validates UUID and bcrypt `device_secret_hash`; in-memory rate limit; returns MQTT credentials |
| `/api/devices` | `frontend/src/app/api/devices/route.ts` | GET, POST | Verified | Auth required; POST admin-only; generates device secret and MQTT credentials |
| `/api/devices/[id]` | `frontend/src/app/api/devices/[id]/route.ts` | GET/DELETE expected | Partially verified | File present; not fully inspected due audit time |
| `/api/health` | `frontend/src/app/api/health/route.ts` | GET | Verified | Minimal public health; detailed health requires `x-internal-token` |
| `/api/llm` | `frontend/src/app/api/llm/route.ts` | GET, POST | Verified | User queueing; internal-token report processing and queue stats |
| `/api/n8n/workflows` | `frontend/src/app/api/n8n/workflows/route.ts` | POST | Verified | Internal-token protected workflow dispatcher |
| `/api/sessions/[id]/summary` | `frontend/src/app/api/sessions/[id]/summary/route.ts` | GET expected | Partially verified | File present; dynamic path route exists |
| `/api/sessions/[id]/start` | `frontend/src/app/api/sessions/[id]/start/route.ts` | POST | Verified | Auth/org check; publishes MQTT `start` command; waits for acknowledgement |
| `/api/sessions/[id]/live` | `frontend/src/app/api/sessions/[id]/live/route.ts` | GET | Verified | Auth/org check; returns live metrics and recording preview frames |
| `/api/sessions/[id]/stream` | `frontend/src/app/api/sessions/[id]/stream/route.ts` | GET | Verified | Auth/org check; SSE polling stream |
| `/auth/callback` | `frontend/src/app/auth/callback/route.ts` | GET expected | Verified present | Supabase auth callback |

### 3. FastAPI Endpoints

| Endpoint | File/function | Method | Status | Security |
|---|---|---:|---|---|
| `/` | `inference/app/main.py::root` | GET | Verified | Public |
| `/health` | `health_check` | GET | Verified | Public, rate-limited, returns model/MQTT/Supabase/storage state |
| `/config` | `get_config` | GET | Verified | Requires `INFERENCE_INTERNAL_TOKEN` |
| `/metrics` | `get_metrics` | GET | Verified | Requires `INFERENCE_INTERNAL_TOKEN` |
| `/simulate` | `simulate_inference` | POST | Verified | Requires token; returns 501 |

### 4. Supabase Edge Functions

| Function | File | Status | Notes |
|---|---|---|---|
| `device-auth` | `supabase/functions/device-auth/index.ts` | Verified | Validates `device_secret` with bcrypt, updates `last_seen_at`, writes audit log |
| `signed-upload-url` | `supabase/functions/signed-upload-url/index.ts` | Verified | Auth token required; validates session/org/modality/filename |
| `signed-download-url` | `supabase/functions/signed-download-url/index.ts` | Verified | Auth token required; validates storage path org ownership and recording row |

### 5. MQTT Topics

| Topic | Producer/consumer | Status |
|---|---|---|
| `org/{org}/device/{device}/status` | Firmware publishes; inference subscribes | Verified |
| `org/{org}/device/{device}/control` | Next API publishes; firmware subscribes | Verified |
| `org/{org}/device/{device}/session/{session}/meta` | Firmware publishes; inference subscribes | Verified |
| `org/{org}/device/{device}/session/{session}/pcg` | Firmware publishes binary; inference subscribes | Verified |
| `org/{org}/device/{device}/session/{session}/ecg` | Firmware publishes binary; inference subscribes | Verified |
| `org/{org}/device/{device}/session/{session}/heartbeat` | Firmware publishes; inference subscribes | Verified |

### 6. n8n Workflow Triggers/Endpoints

Workflow JSON files exist in `n8n/workflows/00` through `07`. They call either `/api/llm?action=process-pending&include_email_payloads=1` or `/api/n8n/workflows?action=...` with `ASCULTICOR_INTERNAL_API_TOKEN`.

## D. Real Hardware Data vs Demo Data Audit

- **Verified:** Real hardware firmware exists and is not just a simulator. Evidence: `AscultiCor_esp32.ino` defines AD8232 on GPIO 32, MAX9814 on GPIO 33, timers for ECG/PCG, and publishes binary ECG/PCG MQTT chunks.
- **Verified:** Inference consumes live MQTT topics and reconstructs signals. Evidence: `SessionBuffer` and `_handle_end_pcg`/`_handle_end_ecg` in `inference/app/mqtt_handler.py`.
- **Verified:** Seeded demo data exists. Evidence: `supabase/seed.sql` inserts "AscultiCor Demo Org", demo profile metadata, demo device metadata, and comments `demo_secret_2024`.
- **Verified:** The dashboard does not depend on seed data as a hard requirement. Evidence: pages query Supabase tables and show empty/loading states; README says seed profiles do not create `auth.users`.
- **Verified:** Inference has deterministic demo fallback predictions. Evidence: `_demo_pcg_prediction`, `_demo_severity_prediction`, `_demo_ecg_prediction` in `inference/app/inference.py`.
- **Verified:** Demo fallback is disabled by default in `.env.example` and `docker-compose.yml` through `ENABLE_DEMO_MODE=false`.
- **Risk:** `InferenceEngine.__init__` defaults `enable_demo_mode=True`, and `MQTTHandler` reads `os.getenv("ENABLE_DEMO_MODE", "true")`. If the environment variable is missing outside Compose, demo mode can activate when all models fail.
- **Verified:** LLM report template mode is enabled by default with `LLM_PROVIDER=demo`; this affects reports, not clinical predictions.
- **Verified:** Session live `seed=1` is not synthetic data; `frontend/src/lib/server/session-live.ts` uses it to fetch initial live_metrics rows or previews from stored recordings.

Classification:

| Demo/mock/sample item | File | Classification | Risk |
|---|---|---|---|
| Demo seed org/profile/device | `supabase/seed.sql` | optional fallback/testing-only | Must not be treated as real clinical data |
| Inference demo predictions | `inference/app/inference.py` | optional fallback | Risk if env var omitted or model files missing |
| LLM demo template | `frontend/src/app/api/llm/route.ts` | default report fallback | Must be visibly labeled in UI/export |
| Settings preferences mock state | `frontend/src/app/settings/page.tsx` | UI mock/polish | Could confuse examiner if presented as saved settings |

## E. Local-to-Hostinger VPS Migration Review

### Local assumptions

- `MQTT_BIND_ADDRESS=127.0.0.1` and `MQTT_WS_BIND_ADDRESS=127.0.0.1` in `.env.example`.
- `NEXT_PUBLIC_MQTT_WS_URL=ws://localhost:9001` in `docker-compose.yml`.
- `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001` in `.env.example` and Compose default.
- `NGINX_SERVER_NAME=localhost` in `.env.example`.
- Inference internal URL defaults to `http://inference:8000`, which is correct inside Docker only.

### Hostinger VPS env vars needed

Set these explicitly:

```env
NGINX_SERVER_NAME=<domain-or-hostinger-hostname>
DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=https://<domain>
DEVICE_BOOTSTRAP_MQTT_HOST=<domain-or-private-tunnel-host>
ALLOWED_ORIGINS=https://<domain>
TRUSTED_HOSTS=<domain>,localhost,127.0.0.1,inference,asculticor-inference
CORS_ORIGIN=https://<domain>
NEXT_PUBLIC_MQTT_WS_URL=wss://<domain>/mqtt
ASCULTICOR_PUBLIC_APP_URL=https://<domain>
N8N_EDITOR_BASE_URL=https://<n8n-domain-or-host:8443>
N8N_WEBHOOK_URL=https://<n8n-domain-or-host:8443>/
ENABLE_DEMO_MODE=false
ECG_SAMPLE_RATE=360
ECG_WINDOW_SIZE=300
```

### Required NGINX changes

- Keep `/` proxying to frontend.
- Keep `/mqtt` WebSocket proxy if browser MQTT is used.
- Decide whether to expose MQTT WebSocket publicly. If yes, use `wss://` and credentials.
- Do not expose `/api/inference/` unless a clear auth boundary is added.

### Required Docker Compose changes

- For safe first Hostinger rollout, keep raw MQTT bound to loopback.
- For real ESP32 over public internet, do not simply open `1883`; use MQTT over TLS, VPN, or a private tunnel.
- Fix `.env.cloud.example` ECG values from `500/500` to `360/300` unless the ECG model is retrained.

### Firewall/port checklist

Open:

- `22/tcp` for SSH
- `80/tcp` for HTTP challenge/redirect
- `443/tcp` for app HTTPS
- `8443/tcp` only if n8n is intentionally exposed on alternate HTTPS

Avoid public exposure unless hardened:

- `1883/tcp`
- `9001/tcp`
- `3000/tcp`
- `8000/tcp`
- `5678/tcp`

### ESP32 connectivity checklist

- Local laptop demo: provision `bootstrap_url` with the laptop LAN IP, not `localhost`.
- Local laptop demo: set `MQTT_BIND_ADDRESS=0.0.0.0` and ensure firewall allows `1883`.
- VPS demo with public MQTT: use TLS/VPN/tunnel before opening raw MQTT.
- Confirm firmware `STATUS` shows WiFi and MQTT connected.
- Confirm dashboard device `last_seen_at` is fresh within 90 seconds.
- Confirm `/api/sessions/[id]/start` command broker target matches ESP32 bootstrap broker target.

### Final VPS runbook

1. Copy `.env.cloud.example` to `.env`.
2. Replace all placeholder secrets and domains.
3. Fix ECG env values to `360` and `300`.
4. Configure Supabase Auth Site URL and redirect URL.
5. Apply migrations after resolving duplicate `025`.
6. Create/verify private `recordings` bucket and policies.
7. Start stack with `docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml up -d --build`.
8. Verify `https://<domain>/api/health`.
9. Verify internal inference health from VPS.
10. Import n8n workflows and set internal token.
11. Provision one ESP32 and test status, start command, PCG/ECG chunks, predictions, and report queue.

## F. Critical Issues

### Blocker

#### Duplicate migration prefix 025

- **Status:** Verified
- **Evidence:** `supabase/migrations/025_auto_generate_patient_mrn.sql`, `supabase/migrations/025_visitor_role.sql`; `scripts/security-smoke.ps1` fails with `Duplicate numbered migrations found: 025`.
- **Impact:** CI/security smoke fails; migration ordering is ambiguous.
- **Recommended fix:** Rename `025_visitor_role.sql` to `026_visitor_role.sql` and increment later migrations, or merge one migration and update docs/CI.
- **Effort:** Small to medium.
- **Affects demo day:** Yes.
- **Affects Hostinger VPS:** Yes.
- **Affects real hardware data flow:** Indirectly through database setup confidence.

### High

#### Cloud ECG model config mismatch

- **Status:** Verified
- **Evidence:** `.env.cloud.example` uses `ECG_SAMPLE_RATE=500` and `ECG_WINDOW_SIZE=500`; `inference/app/inference.py` comments and `.env.example` state MIT-BIH `360 Hz` and `300` sample windows.
- **Impact:** Hostinger deployment can run ECG inference with wrong preprocessing shape/rate.
- **Recommended fix:** Change cloud env defaults to `ECG_SAMPLE_RATE=360` and `ECG_WINDOW_SIZE=300`.
- **Effort:** Small.
- **Affects demo day:** Yes if cloud demo.
- **Affects Hostinger VPS:** Yes.
- **Affects real hardware data flow:** Yes for ECG predictions.

#### MQTT exposure/binding can block hardware or expose plaintext

- **Status:** Verified
- **Evidence:** `.env.example`, `.env.cloud.example`, `docker-compose.yml`, `mosquitto/config/mosquitto.conf`.
- **Impact:** `127.0.0.1` blocks ESP32; `0.0.0.0` without TLS exposes plaintext MQTT.
- **Recommended fix:** Provide two explicit profiles: local LAN demo and hardened VPS IoT. Document and script both.
- **Effort:** Medium.
- **Affects demo day:** Yes.
- **Affects Hostinger VPS:** Yes.
- **Affects real hardware data flow:** Yes.

#### In-memory bootstrap rate limiting

- **Status:** Verified
- **Evidence:** `bootstrapAttempts = new Map` in `frontend/src/app/api/device/bootstrap/route.ts`.
- **Impact:** Resets on restart and does not protect multi-instance deployments.
- **Recommended fix:** Store attempts in Supabase or Redis-like store keyed by IP/device.
- **Effort:** Medium.
- **Affects demo day:** Low.
- **Affects Hostinger VPS:** Yes.
- **Affects real hardware data flow:** Security only.

### Medium

#### Medical wording overclaims diagnosis

- **Status:** Verified
- **Evidence:** `Model1StateCard` comment says "primary diagnosis"; session page exports "Diagnostic Report"; Model 2 component displays "Diagnostic Metrics"/"Functional Analysis".
- **Impact:** Examiner/medical safety concern.
- **Recommended fix:** Rename to "AI Analysis", "Signal Review", "Educational Report", and "Model Output".
- **Effort:** Small.
- **Affects demo day:** Yes.
- **Affects Hostinger VPS:** No.
- **Affects real hardware data flow:** No.

#### Silent report fallback to demo template

- **Status:** Verified
- **Evidence:** `frontend/src/app/api/llm/route.ts::generateLLMReport` catches Claude errors and falls through to `generateDemoReport`.
- **Impact:** Users may think an LLM generated the report when template fallback did.
- **Recommended fix:** Persist `provider_mode`, `fallback_reason`, and show a visible badge in UI/export.
- **Effort:** Small.

#### Hostinger docs contain stale absolute links

- **Status:** Verified
- **Evidence:** `docs/HOSTINGER_VPS_DEPLOYMENT.md` links to `/d:/cardiosense-project/cardiosense/...`.
- **Impact:** Examiner setup docs look unpolished and links break.
- **Recommended fix:** Replace with relative links.
- **Effort:** Small.

### Low

#### Local toolchain unavailable/incomplete

- **Status:** Verified
- **Evidence:** `npm.cmd run typecheck` fails because `tsc` missing; `npm.cmd run lint` fails because `next` missing; `python`/`py` not found; `docker` not found.
- **Impact:** Cannot validate build on this machine without setup.
- **Recommended fix:** Run `npm ci`, install Python 3.11, install Docker Desktop or validate in CI.
- **Effort:** Medium local setup.

## G. Hardware-to-Software Connection Improvement Plan

### Simplest recommended real-device flow

1. Start local stack with MQTT exposed to LAN:
   ```env
   MQTT_BIND_ADDRESS=0.0.0.0
   MQTT_WS_BIND_ADDRESS=0.0.0.0
   DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=http://<laptop-lan-ip>:3000
   DEVICE_BOOTSTRAP_MQTT_HOST=<laptop-lan-ip>
   DEVICE_BOOTSTRAP_MQTT_PORT=1883
   ENABLE_DEMO_MODE=false
   ```
2. Create device in `/devices`.
3. Provision ESP32 with `device_id`, `device_secret`, `bootstrap_url`, WiFi SSID/pass.
4. Verify firmware `STATUS`.
5. Verify device appears online in dashboard.
6. Create patient/session and use `/api/sessions/[id]/start`.
7. Watch Serial Monitor for `Control command: start`, `start_pcg`, `start_ecg`, chunks, and `end_*`.
8. Verify Supabase rows in `live_metrics`, `recordings`, `predictions`.

### Hostinger VPS hardware flow

- Prefer VPN/private tunnel or MQTT TLS before remote ESP32 streaming.
- Keep raw MQTT private for first dashboard-only deployment.
- If direct ESP32-to-VPS is required, use a TLS listener or managed broker and set `DEVICE_BOOTSTRAP_MQTT_TLS=true`.

### Troubleshooting Table

| Symptom | Likely cause | Check | Fix |
|---|---|---|---|
| ESP32 never online | MQTT bound to loopback | `.env`, Docker port map | Use LAN IP and `MQTT_BIND_ADDRESS=0.0.0.0` for local demo |
| Start command times out | Command broker differs from device broker | Audit log `session_start_no_ack` metadata | Align `MQTT_COMMAND_BROKER_URL` and bootstrap MQTT host |
| Live waveform empty | No `live_metrics` rows | Supabase `live_metrics` | Check inference logs/MQTT subscriptions |
| Predictions missing | Model load failure or no end meta | Inference `/health`, audit logs | Verify model files and firmware sends `end_pcg`/`end_ecg` |
| ECG looks wrong on VPS | Cloud ECG env mismatch | `.env.cloud.example` | Use `360/300` |

## H. Security Review

- **Auth:** Verified Supabase Auth use in middleware and route handlers.
- **RLS:** Verified migrations enable RLS and define org-scoped policies for major tables.
- **Tenant isolation:** Verified frontend APIs check profiles/org in device/session routes; RLS provides backend guard.
- **Secrets:** `.env.example` uses placeholders; no real `.env` inspected.
- **Internal tokens:** Verified `/api/health?details=1`, `/api/llm?action=process-pending`, `/api/n8n/workflows`, FastAPI `/config` and `/metrics` use internal tokens.
- **MQTT credentials:** Verified per-device credential generation and Mosquitto sync. Fallback shared MQTT credentials still exist.
- **Device secrets:** Verified device creation hashes secrets with bcrypt and bootstrap validates with bcrypt.
- **Storage signed URLs:** Verified Edge Functions validate auth, org, path shape, and recording/session ownership.
- **LLM/n8n payload safety:** `N8N_EMAIL_PAYLOAD_EXPORT_ENABLED=false` by default; if enabled, `/api/llm` can return email bodies to trusted n8n.
- **CORS/trusted hosts:** Present but must be updated for Hostinger domain.
- **Audit logs:** Device creation, bootstrap, inference completion/failure, and start command events write audit logs.
- **VPS firewall:** Docs recommend only `22`, `80`, `443`, optional `8443`; do not open MQTT without hardening.
- **TLS:** NGINX TLS documented for HTTPS; MQTT TLS not implemented in Mosquitto config.

## I. AI/Signal Review

- **PCG pipeline:** Verified firmware publishes PCG int16 chunks; inference reconstructs, writes WAV, runs XGBoost, conditionally runs severity CNN.
- **ECG pipeline:** Verified firmware publishes ECG int16 chunks; inference reconstructs, resamples to target, filters, windows, runs BiLSTM, maps raw classes to AAMI labels.
- **Model artifact loading:** Verified paths in `inference/app/inference.py` match files under `models/`.
- **Sample rates:** Local/default Compose values are consistent with model comments; cloud env is inconsistent.
- **Real sensor handling:** Verified firmware preflight and warnings; inference session timeout and DB stale session timeout exist.
- **Output wording:** Risk due "diagnosis"/"diagnostic" UI wording; report template includes disclaimer.
- **Demo mode behavior:** Disabled in Compose defaults; risk if env missing because code defaults to demo mode.
- **Failure modes:** If a single model is missing and demo mode is false, prediction function returns error JSON for that model; if all models fail and demo mode false, service startup raises.

## J. Recommended Refactor Roadmap

### 1. Must fix before demo

| Item | Files | Reason | Verification |
|---|---|---|---|
| Resolve duplicate migration `025` | `supabase/migrations/*`, docs/CI references | CI and DB setup reliability | `powershell -File scripts/security-smoke.ps1` |
| Add local hardware env example | `.env.hardware.example`, README | Avoid localhost ESP32 failure | ESP32 status appears online |
| Change medical overclaim wording | `Model1StateCard.tsx`, session page, report export | Safety/examiner confidence | Search no "diagnosis" except disclaimers |
| Verify model health before demo | `models/`, inference env | Prevent demo fallback | `/health` reports `models_loaded: 3`, `demo_mode: false` |

### 2. Must fix before Hostinger VPS deployment

| Item | Files | Reason | Verification |
|---|---|---|---|
| Fix cloud ECG env | `.env.cloud.example` | Correct ECG preprocessing | `/config` returns 360/300 |
| Replace stale doc links | `docs/HOSTINGER_VPS_DEPLOYMENT.md` | Reproducible examiner docs | Click relative links |
| Decide secure MQTT path | `mosquitto/config`, NGINX, docs | Avoid plaintext public ECG/PCG traffic | TLS/VPN test |
| Add persistent bootstrap rate limit | `/api/device/bootstrap` | Brute-force resilience | Repeated attempts blocked after restart |

### 3. Should fix before submission

- Add `MQTT_CONTRACT.md`.
- Add `REAL_DATA_VS_DEMO_MODE.md`.
- Add a hardware-in-the-loop checklist.
- Add minimal unit tests for provisioning, MQTT topic builders, and report fallback labeling.
- Add screenshots of real hardware flow.

### 4. Optional polish

- Replace "Preferences Mock State" with persisted settings or label it explicitly.
- Add public readiness endpoint separate from detailed health.
- Add model cards.
- Add QR provisioning validation and firmware response examples.

### 5. Future work

- MQTT over TLS or managed IoT broker.
- Redis-backed or database-backed rate limiting.
- Device credential rotation/revocation UI.
- Hardware simulator clearly separated from production mode.
- Clinical validation and dataset/model documentation.

## K. Concrete Patch Suggestions

### Fix cloud ECG defaults

Edit `.env.cloud.example`:

```env
ECG_SAMPLE_RATE=360
ECG_WINDOW_SIZE=300
```

### Make demo mode fail closed when env is missing

In `inference/app/mqtt_handler.py`, change:

```python
enable_demo_mode=os.getenv("ENABLE_DEMO_MODE", "true").lower() == "true"
```

to:

```python
enable_demo_mode=os.getenv("ENABLE_DEMO_MODE", "false").lower() == "true"
```

### Persist report fallback reason

In `frontend/src/app/api/llm/route.ts`, include fields such as:

```ts
provider_mode: llmProvider,
fallback_reason: err?.message || null,
```

and render a visible badge in `/reports` and `/session/[id]`.

### Add DB-backed bootstrap attempt tracking

Create a table such as `device_bootstrap_attempts` with `device_id`, `ip_hash`, `attempted_at`, `success`. Use it in `/api/device/bootstrap` instead of the in-memory `Map`.

### Replace medical overclaim wording

Use:

- "AI Signal Review"
- "Educational Analysis"
- "Model Output"
- "Clinical review recommended"

Avoid:

- "diagnosis"
- "diagnostic report"
- "no evidence of valvular abnormalities" unless validated by a clinician.

## L. Documentation To Add

| Doc | Purpose | Required sections |
|---|---|---|
| `HARDWARE_SETUP.md` | Reproducible ESP32 wiring/provisioning | Parts, wiring, flashing, serial commands, LAN IP setup, sensor placement, safety |
| `MQTT_CONTRACT.md` | Single source for topics/payloads | Topic list, JSON schemas, binary formats, QoS, retained flags, examples |
| `API_REFERENCE.md` | Examiner/backend reference | Next APIs, FastAPI endpoints, auth, request/response examples |
| `HOSTINGER_VPS_DEPLOYMENT.md` | Clean final VPS guide | Relative links, env matrix, TLS, firewall, Supabase, n8n, MQTT decision |
| `DEMO_RUNBOOK.md` | Demo-day execution | Preflight, start stack, provision, session, expected evidence, fallback plan |
| `TROUBLESHOOTING.md` | Fast recovery | Symptom/cause/fix tables for MQTT, Supabase, inference, firmware |
| `SECURITY_MODEL.md` | Security explanation | Auth, RLS, tokens, MQTT creds, storage, audit, VPS boundary |
| `MODEL_CARD.md` | AI transparency | Datasets, classes, sample rates, limitations, intended use, non-diagnostic disclaimer |
| `REAL_DATA_VS_DEMO_MODE.md` | Separation clarity | Real path, demo seed, inference fallback, report template mode, how to disable |

## M. Final Graduation Readiness Score

**Score: 78/100**

Explanation: The architecture is strong and unusually complete for a graduation project: real firmware, MQTT, inference, Supabase, dashboard, n8n, Docker, and Hostinger documentation are all present. The main weaknesses are migration hygiene, cloud config mismatch, demo/report fallback clarity, medical wording, and lack of locally verified build/test results in this environment.

Top 5 changes that would most improve the score:

1. Resolve duplicate migration numbering and pass `scripts/security-smoke.ps1`.
2. Fix `.env.cloud.example` ECG settings to match the trained model.
3. Add `REAL_DATA_VS_DEMO_MODE.md` and visible UI/report badges for template/demo/fallback outputs.
4. Add `MQTT_CONTRACT.md` plus a one-command local hardware demo env profile.
5. Run CI/build/typecheck successfully and attach screenshots/logs from a real ESP32 session.

Readiness:

- **Local demo:** Good if dependencies, Supabase, and MQTT LAN binding are configured.
- **Real hardware demo:** Promising and mostly wired end-to-end, but must be rehearsed with actual ESP32 and sensor placement.
- **Hostinger VPS deployment:** Partially ready. Dashboard-first VPS deployment is documented; direct remote ESP32 streaming needs MQTT hardening and the ECG env fix.

## Inspected Files and Commands

Inspected source/config included:

- `README.md`, `.env.example`, `.env.cloud.example`
- `docker-compose.yml`, `docker-compose.cloud.yml`
- `frontend/package.json`, `frontend/src/app/**`, selected frontend components/libs
- `inference/app/main.py`, `mqtt_handler.py`, `inference.py`, `preprocessing.py`, `supabase_client.py`, `security.py`
- `firmware/asculticor_esp32/AscultiCor_esp32.ino`, `firmware/README.md`
- `mosquitto/config/*`, `mosquitto/scripts/sync_device_credentials.py`
- `nginx/default.conf.template`
- `supabase/migrations/*.sql`, `supabase/seed.sql`, `supabase/functions/*/index.ts`
- `n8n/workflows/*.json`, `n8n/README.md`
- `docs/HOSTINGER_VPS_DEPLOYMENT.md`, selected deployment and real-device docs
- `.github/workflows/ci.yml`

Command results:

- `rg --files`: succeeded.
- `powershell -File scripts/security-smoke.ps1`: failed due duplicate migration `025`.
- `npm run typecheck`: blocked by PowerShell execution policy when using `npm.ps1`.
- `npm.cmd run typecheck`: failed because `tsc` was not installed locally.
- `npm.cmd run lint`: failed because `next` was not installed locally.
- `python -m compileall app`: failed because `python` was not available on PATH.
- `py -m compileall app`: failed because `py` was not available on PATH.
- `docker compose config`: failed because `docker` was not available on PATH.

Not fully inspected:

- Every line of every large UI page/component.
- Binary model internals.
- Word/PDF artifacts.
- Live Supabase project state.
- Actual ESP32 compile/upload.
- Actual Docker runtime behavior.

Residual risk: real hardware timing, analog signal quality, model runtime compatibility, Supabase production settings, and Hostinger firewall/TLS behavior still require live validation.
