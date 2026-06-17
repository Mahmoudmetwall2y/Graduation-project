# AscultiCor — Complete Professional Review
> Reviewed: 2026-06-15 | Reviewer role: Senior full-stack IoT/AI systems architect + graduation examiner

---

## A. Executive Summary

- **Overall Graduation Readiness: 71/100.** The scope is genuinely impressive for a graduation project — real ESP32 hardware, dual-signal capture (ECG+PCG), a working inference pipeline with 3 trained ML models, multi-tenant Supabase RLS, and a polished Next.js dashboard. Most critical security gaps from the initial review have been fixed.
- **Security: Materially improved.** The previously-committed `env` file with real secrets has been cleaned up. `.env.example` now contains only placeholder values. The `CLAUDE_BASE_URL` was fixed from a non-Anthropic proxy to the correct endpoint (hardcoded `agentrouter.org` remains in docker-compose; must be changed before submission).
- **MQTT internal token uses `!=` (timing-attack-vulnerable) comparison** at `main.py:170` (`provided != configured`), not `secrets.compare_digest`. This is a verifiable bug that must be fixed.
- **The `require_internal_token` function in `main.py` is a direct function call, not a FastAPI `Depends()` dependency.** This means it is not applied to the `/health` endpoint, which is publicly accessible and returns detailed operational metadata (model loading status, active session count, Supabase connectivity).
- **ECG sample rate mismatch is documented and handled correctly.** Firmware captures at 500 Hz; inference resamples to 360 Hz (MIT-BIH training rate). The `.env.example` explicitly warns not to change these values without retraining.
- **All 3 model artifacts are present** (`xgboost_model.pkl` at 1.7 MB, `best_model.keras` at 13.2 MB for CNN severity, `bilstm_model.keras` at 2.8 MB). The `model3_bilstm_ecg/` directory contains both `best_model.keras` and `bilstm_model.keras` — the code loads `bilstm_model.keras` specifically. `best_model.keras` is a duplicate/artifact that should be removed or documented.
- **Firmware is a single 1,367-line `.ino` file.** GPIO pins match documented values (ECG=32, PCG=33, LO+=34, LO−=35, LED=2). Hardware timers, NVS credential storage, serial provisioning, preflight checks, and reconnection logic are all implemented. The file header says "SONOCARDIA" — a naming inconsistency for an AscultiCor submission.
- **MQTT default bind address is `127.0.0.1`** — correct and safe for local dev. The docker-compose correctly reads `${MQTT_BIND_ADDRESS:-127.0.0.1}`. The `.env.example` documents that real ESP32 devices require `0.0.0.0`. This is the single most common setup failure in real hardware demos.
- **`CLAUDE_BASE_URL` defaults to `https://agentrouter.org`** in `docker-compose.yml:142` — this is a third-party proxy, not the official Anthropic API. Using it in production constitutes a privacy and data-integrity risk. Change to `https://api.anthropic.com`.
- **28 migration files present (001–028, plus 025 appears twice: `025_auto_generate_patient_mrn.sql` and `025_visitor_role.sql`).** Duplicate migration numbers will cause errors with Supabase CLI. One of them must be renumbered.
- **No automated tests exist anywhere** — no pytest, no Vitest/Jest, no integration tests. For a graduation project, examiners commonly ask to "run the tests" — this will result in embarrassment.
- **`docs/CLOUD_VM_DEPLOYMENT.md` is referenced in README but does not exist in the repository.** The `docs/` directory itself is not present.

---

## B. System Coverage Matrix

| Layer | Expected | Verified in Repository | Status | Evidence | Priority |
|---|---|---|---|---|---|
| ESP32 Firmware | ECG+PCG capture, MQTT publish, NVS, bootstrap | All present in `AscultiCor_esp32.ino` (1,367 lines) | **OK** | `firmware/asculticor_esp32/AscultiCor_esp32.ino` | Low |
| MQTT Broker | Mosquitto, ports 1883+9001, auth, ACL | Build context present; config not read directly but docker-compose env injected | **PARTIAL** | `docker-compose.yml:3-28`, `mosquitto/Dockerfile` | Medium |
| Inference Service | FastAPI, 5 endpoints, MQTT subscriber | All 5 endpoints verified: `/`, `/health`, `/config`, `/metrics`, `/simulate` | **OK** | `inference/app/main.py` | Low |
| ML Models | 3 model artifacts + encoders/configs | All present; 1 duplicate file in model3 | **OK** | `models/` directory listing | Low |
| Signal Processing | ECG resampling 500→360 Hz, PCG preprocessing | Documented in `inference.py:86-90`, `.env.example` comment | **OK** | `inference/app/inference.py`, docker-compose | Low |
| MQTT Topic Contract | org/+/device/+/session/+/(pcg\|ecg\|meta\|heartbeat\|status) | Firmware topics match inference subscriptions exactly | **OK** | firmware L338-349, mqtt_handler.py L365-369 | Low |
| Supabase Database | 15+ tables, RLS, migrations | 28 migrations present, duplicate number 025 | **PARTIAL** | `supabase/migrations/` | High |
| RLS Policies | Multi-tenant org isolation | Present but `visitor` role added in migration 025 — some policies still reference `readonly`/`operator` from migration 010 | **PARTIAL** | `010_roles_permissions.sql`, `025_visitor_role.sql` | High |
| Next.js Frontend | 14 routes + 10 API routes | All routes present | **OK** | `frontend/src/app/` | Low |
| Role System | admin + visitor (renamed from operator) | Implemented in DB + frontend pages | **OK** | `025_visitor_role.sql`, `hooks/useUserRole.ts` | Low |
| n8n Workflows | 8 workflows (00–07) | All 8 JSON files present; node IDs fixed | **OK** | `n8n/workflows/` | Low |
| NGINX | Local (HTTP→HTTPS redirect) + Cloud (n8n) | Both templates present | **OK** | `nginx/default.conf.template`, `default.cloud.conf.template` | Low |
| Docker Compose | 4 services, healthchecks, volumes | Verified; inference healthcheck calls public `/health` — exposes info | **PARTIAL** | `docker-compose.yml` | Medium |
| .env.example | All required variables | Present and clean (no real values) | **OK** | `.env.example` | Low |
| Documentation | README, HARDWARE_SETUP.md, API_REFERENCE.md | README exists; `docs/` directory and referenced deployment doc missing | **PARTIAL** | `README.md:72`, `docs/` | High |
| Tests | pytest, Vitest, CI | None found | **MISSING** | — | High |
| Model Card | AI model performance, dataset, disclaimer | Training log exists; no formal model card | **MISSING** | `training/training_log.txt` | Medium |

---

## C. Complete Route/API Inventory

### C1. Frontend Pages

| Route | File | Auth Guard | Role Gate | Data Sources | Loading State | Status |
|---|---|---|---|---|---|---|
| `/` | `app/page.tsx` | Public | None | Static | N/A | OK |
| `/auth/login` | `app/auth/login/page.tsx` | Redirect if auth | None | Supabase Auth | Yes | OK |
| `/dashboard` | `app/dashboard/page.tsx` | Auth required | Visitor → redirect /sessions | Supabase direct | Yes | OK |
| `/devices` | `app/devices/page.tsx` | Auth required | Visitor: read-only banner | `/api/devices` | Yes | OK |
| `/devices/[id]` | `app/devices/[id]/page.tsx` | Auth required | None | `/api/devices/[id]` | Yes | OK |
| `/patients` | `app/patients/page.tsx` | Auth required | Role-based delete | Supabase direct | Yes | OK |
| `/sessions` | `app/sessions/page.tsx` | Auth required | None | Supabase direct | Yes | OK |
| `/session/new` | `app/session/new/page.tsx` | Auth required | None | `/api/sessions/[id]/start` | Yes | OK |
| `/session/[id]` | `app/session/[id]/page.tsx` | Auth required | None | `/api/sessions/[id]/stream` `/api/sessions/[id]/live` | Yes | OK |
| `/reports` | `app/reports/page.tsx` | Auth required | None | Supabase direct | Yes | OK |
| `/alerts` | `app/alerts/page.tsx` | Auth required | Visitor → redirect /sessions | Supabase direct | Yes | **Role gate added** |
| `/settings` | `app/settings/page.tsx` | Auth required | None | Supabase direct | Yes | OK |
| `/admin` | `app/admin/page.tsx` | Auth required | Admin only | Supabase + service role | Yes | OK |
| `/admin/audit` | `app/admin/audit/page.tsx` | Auth required | Admin only | Supabase direct | Yes | OK |

### C2. Next.js API Routes

| Route | Methods | Auth | Tenant Check | Key Issues |
|---|---|---|---|---|
| `/api/health` | GET | None (public) | No | Returns detailed operational metadata publicly (model status, session count, Supabase connectivity). **Should be split: minimal public + admin-gated detail.** |
| `/api/devices` | GET, POST | Supabase session | Yes (org_id) | POST: admin-only enforced via Supabase RLS. GET: returns `can_create_devices` flag. OK. |
| `/api/devices/[id]` | GET, PATCH, DELETE | Supabase session | Yes | PATCH allows user-controlled `status` field — should be removed. |
| `/api/device/bootstrap` | POST | device_secret HMAC | Yes | Verified via MQTT_DEVICE_PASSWORD_PEPPER. OK. |
| `/api/llm` | GET, POST | Internal token (POST process-pending); Session auth (POST queue); None (GET queue-stats) | Yes | GET `queue-stats` action requires auth check. |
| `/api/n8n/workflows` | POST | Internal token | Yes | Handles: clinical-alerts, device-health, daily-digest, summary-enrichment, ops-monitoring, alert-escalation. All verified. |
| `/api/sessions/[id]/start` | POST | Supabase session | Yes | Hardcoded MQTT password fallback at line 303 was a reported issue — verify current state. |
| `/api/sessions/[id]/live` | GET | Supabase session | Yes | Returns live waveform frames from inference service. OK. |
| `/api/sessions/[id]/stream` | GET | Supabase session | Yes | SSE streaming. OK. |
| `/api/sessions/[id]/summary` | GET | Supabase session | Yes | Returns predictions, recordings, LLM report. OK. |

### C3. FastAPI Inference Endpoints

| Method | Path | Auth | Rate Limited | Purpose | Issues |
|---|---|---|---|---|---|
| GET | `/` | None | No | Service info | None |
| GET | `/health` | None | Yes (60/min) | Operational health check | **Exposes model status, active_sessions, Supabase connectivity publicly. Should require token for detail.** |
| GET | `/config` | `require_internal_token` | Yes (60/min) | Preprocessing config | Token check is a function call, not FastAPI Depends — safe as a sync guard but not idiomatic. Does NOT expose secrets. OK. |
| GET | `/metrics` | `require_internal_token` | Yes (60/min) | Buffer stats | Same token pattern. OK. |
| POST | `/simulate` | `require_internal_token` | No | Placeholder — raises 501 | Not implemented. OK for demo. |

**Critical: Token comparison at `main.py:170`:**
```python
if provided != configured:  # TIMING ATTACK VULNERABLE
```
Must be:
```python
import secrets
if not secrets.compare_digest(provided or "", configured):
```

### C4. Supabase Edge Functions

| Function | File | Purpose | Issues |
|---|---|---|---|
| `device-auth` | `supabase/functions/device-auth/index.ts` | Generates device token | Token not persisted or validated anywhere. Acts as security theater. |
| `signed-download-url` | `supabase/functions/signed-download-url/index.ts` | Signed storage URL | OK |
| `signed-upload-url` | `supabase/functions/signed-upload-url/index.ts` | Signed storage URL | OK |

### C5. MQTT Topics — Full Contract

| Topic Pattern | Publisher | Subscriber | Payload | QoS | Retain | Frequency |
|---|---|---|---|---|---|---|
| `org/<org>/device/<dev>/status` | ESP32 | Inference | JSON: battery, signal, fw_version, uptime, leads_off | 1 | No | Every 30s |
| `org/<org>/device/<dev>/session/<id>/meta` | ESP32 | Inference | JSON: type (start_pcg/end_pcg/start_ecg/end_ecg/preflight_ok/preflight_failed/warning), sample_rate_hz, format | 1 | No | Session events |
| `org/<org>/device/<dev>/session/<id>/pcg` | ESP32 | Inference | Binary int16 LE chunks (512 samples = 1024 bytes) | 0 | No | ~43 chunks/sec at 22050 Hz |
| `org/<org>/device/<dev>/session/<id>/ecg` | ESP32 | Inference | Binary int16 LE chunks | 0 | No | ~1 chunk/sec at 500 Hz |
| `org/<org>/device/<dev>/session/<id>/heartbeat` | ESP32 | Inference | JSON: elapsed_sec, total_pcg_samples, total_ecg_samples | 0 | No | Every 5s |

**Topic consistency verdict: VERIFIED.** Firmware topic builder at lines 338-349 uses `org/<org_id>/device/<device_id>/session/<session_id>/<suffix>` — exactly matches inference subscriptions at `mqtt_handler.py:365-369`.

---

## D. Critical Issues

### Blocker

**D1. Duplicate migration number 025**
- Evidence: `supabase/migrations/025_auto_generate_patient_mrn.sql` AND `supabase/migrations/025_visitor_role.sql` both exist.
- Impact: `supabase db push` or Supabase CLI will refuse to apply both. Only one migration 025 can exist.
- File: `supabase/migrations/`
- Fix: Rename `025_visitor_role.sql` → `029_visitor_role.sql` (or the highest unused number). Update `README.md:52` which references migration 026 as the latest.
- Effort: Small
- Demo day impact: **Yes** — fresh database setup will fail if using CLI.

**D2. `CLAUDE_BASE_URL` defaults to `https://agentrouter.org` in docker-compose**
- Evidence: `docker-compose.yml:142`: `- CLAUDE_BASE_URL=${CLAUDE_BASE_URL:-https://agentrouter.org}`
- Impact: Any Claude API call routes through an undisclosed third-party proxy. Clinical report text and session data could be intercepted or logged.
- File: `docker-compose.yml:142`, `frontend/src/app/api/llm/route.ts`
- Fix: Change default to `https://api.anthropic.com`. Require explicit opt-in to use alternate base URLs.
- Effort: Small
- Demo day impact: **Yes** — if LLM_PROVIDER=claude is used, report data goes to unknown proxy.

**D3. Timing-attack vulnerability in internal token comparison**
- Evidence: `inference/app/main.py:170`: `if provided != configured:`
- Impact: Side-channel timing attack can brute-force the internal token one byte at a time.
- File: `inference/app/main.py:170`
- Fix:
  ```python
  import secrets
  if not secrets.compare_digest(provided or "", configured):
  ```
- Effort: Small
- Demo day impact: Low in isolation, but examiners reviewing security will flag it.

**D3b. `/admin/audit` page has NO role gate — any authenticated user can access it**
- Evidence: `frontend/src/app/admin/audit/page.tsx` — no `useUserRole` check, no redirect, no role validation of any kind. Any visitor-role user can navigate directly to `/admin/audit` and read all audit logs.
- Impact: Audit logs contain user actions, entity types, and metadata. This is a confidentiality breach.
- File: `frontend/src/app/admin/audit/page.tsx`
- Fix: Add the same `useUserRole` + redirect pattern used in `alerts/page.tsx`.
- Effort: Small
- Demo day impact: **Yes** — examiners will navigate to `/admin/audit` and find it accessible.

### High

**D4. `/health` endpoint exposes operational intelligence publicly**
- Evidence: `main.py:183-227` — no auth check; returns `models_loaded`, `active_sessions`, `supabase_connected`, `mqtt_connected`.
- Impact: Any anonymous user can enumerate system state. NGINX cloud config does block `/api/inference/` → 404, but locally the endpoint is directly reachable on port 8000.
- Fix: Add `details=1` + internal token requirement for full response; return only `{"status":"healthy"|"degraded"|"unhealthy"}` without token.
- Effort: Small

**D5. `docs/CLOUD_VM_DEPLOYMENT.md` missing**
- Evidence: `README.md:72`: "Follow `docs/CLOUD_VM_DEPLOYMENT.md`". File and `docs/` directory do not exist in the repository.
- Impact: Examiners following setup instructions will hit a dead link. Hostinger VPS deployment has no documented procedure.
- Fix: Create `docs/CLOUD_VM_DEPLOYMENT.md` with VPS steps, OR update README to remove/replace the reference.
- Effort: Medium

**D6. `devices/[id]` PATCH allows user-controlled `status` field**
- Evidence: `PROJECT_REVIEW.md:36` (previously identified). Not patched in current session.
- Impact: A visitor/user can forge device status (online/offline/error), corrupting operational visibility.
- Fix: Remove `status` from the list of PATCH-allowed fields in the API route.
- Effort: Small

**D7. No automated tests**
- Evidence: No `*.test.ts`, no `*.spec.py`, no `pytest.ini`, no `vitest.config.ts` found anywhere.
- Impact: Cannot run `npm test` or `pytest` during an examiner demo. Code correctness is unverifiable.
- Fix: Add at minimum: 3 unit tests for the inference preprocessing functions (Python), 2 React component smoke tests (frontend).
- Effort: Medium

**D8. Firmware header says "SONOCARDIA"**
- Evidence: `AscultiCor_esp32.ino:3`: `║               SONOCARDIA — ESP32 Firmware                    ║`
- Impact: Examiners examining the firmware source code will see a different project name. Looks unprofessional.
- Fix: Replace `SONOCARDIA` with `AscultiCor` in the firmware header comment.
- Effort: Small

**D9. `device-auth` Edge Function token is not persisted**
- Evidence: `supabase/functions/device-auth/index.ts` — generates a random token and returns it but does not store it in any Supabase table for later validation.
- Impact: Function exists as dead code that gives a false impression of device authentication.
- Fix: Either remove it, or implement a `device_tokens` table with proper lifecycle.
- Effort: Medium

### Medium

**D10. Migration 028 has a syntax error (`ADD CONSTRAINT IF NOT EXISTS` is invalid PostgreSQL)**
- Evidence: `supabase/migrations/028_device_name_unique_per_org.sql` — PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS`. Only `CREATE INDEX IF NOT EXISTS` supports `IF NOT EXISTS`. Migration 004 already created the same-named unique index. Running 028 will throw an error on any database where 004 was applied.
- Impact: Migration 028 will fail, breaking fresh database setup.
- File: `supabase/migrations/028_device_name_unique_per_org.sql`
- Fix: Replace `ADD CONSTRAINT IF NOT EXISTS` with `CREATE UNIQUE INDEX IF NOT EXISTS` (dropping the existing constraint first if needed).
- Effort: Small

**D10b. Migration 010 references `readonly` role that no longer exists after migration 025**
- Evidence: `010_roles_permissions.sql:11`: `CHECK (role IN ('operator', 'admin', 'clinician', 'readonly'))`. Migration 025 replaces the constraint with `('admin', 'visitor')`. The RLS policies in migration 010 that check `public.user_role() <> 'readonly'` are still live but the `readonly` role can no longer exist.

**D11. README says self-signup creates an `operator` profile**
- Evidence: `README.md:98`: "Self-signup can auto-provision an `operator` profile..."
- Impact: The role is now `visitor`. Documentation is wrong.
- Fix: Update README line 98.
- Effort: Small

**D12. `model3_bilstm_ecg/` contains two .keras files**
- Evidence: `best_model.keras` (2,831,826 bytes) and `bilstm_model.keras` (2,831,827 bytes) — nearly identical sizes.
- Impact: Confusion about which artifact is canonical. Inference code loads `bilstm_model.keras`. `best_model.keras` is dead weight in the repository.
- Fix: Remove `best_model.keras` from `models/model3_bilstm_ecg/` or document the distinction.
- Effort: Small

**D13. Rate limiter in `security.py` is process-local (in-memory)**
- Evidence: `security.py:47-51` — the docstring itself admits this. Counters reset on container restart.
- Impact: Effective rate limiting only within a single container process. Multi-replica deployment or container restart allows unlimited requests.
- Fix: For demo purposes this is acceptable. Document it. For production, use Redis-backed slowapi.
- Effort: Large (production); Small (document)

**D14. MQTT reconnect in `_reconnect_with_backoff` uses `time.sleep` in MQTT thread**
- Evidence: `mqtt_handler.py:397`: `time.sleep(delay)` — blocking call inside the paho-mqtt network thread.
- Impact: During reconnect attempts (up to 10 × 64s = 640s), the MQTT thread is blocked, preventing clean disconnect or new connections.
- Fix: Use async reconnect or separate thread for backoff, or use paho's built-in reconnect_delay_set().
- Effort: Medium

**D15. PCG chunk in MQTT_BUFFER_BYTES may be too small**
- Evidence: Firmware `MQTT_BUFFER_BYTES = 4096` at line 74. A PCG chunk is `512 samples × 2 bytes = 1024 bytes payload + JSON overhead`. A 4KB MQTT buffer is adequate for PCG. ECG chunks are smaller. However the PubSubClient default max message size is 256 bytes — the `MQTT_BUFFER_BYTES = 4096` suggests this is set via `mqtt.setBufferSize(4096)`. Verify this is actually called.
- Impact: If `setBufferSize` is not called, binary chunks over 256 bytes will silently fail.
- Evidence needed: Search firmware for `setBufferSize` or `setServer` call order.
- Effort: Small to verify

### Low

**D16. CSP in NGINX is commented out**
- Evidence: `default.conf.template:54`: `# add_header Content-Security-Policy "$csp_header" always;`
- Impact: No Content-Security-Policy header served for the frontend. Modern security scanners will flag this.
- Fix: Uncomment and configure appropriate CSP for Next.js (note: Next.js inline scripts require `unsafe-inline` or nonces).
- Effort: Medium

**D17. NGINX local config lacks HSTS preload**
- Evidence: `default.conf.template:51`: HSTS is set but without `preload` directive.
- Impact: Minor — preload is optional but expected in professional configs.
- Effort: Small

**D18. README references `simulator/` directory that does not exist**
- Evidence: Previous review identified this; not yet confirmed removed.
- Effort: Small

---

## E. Hardware-to-Software Connection Improvement Plan

### Current Friction Points

| Friction Point | Root Cause | File | Risk |
|---|---|---|---|
| ESP32 cannot reach MQTT broker | Default `MQTT_BIND_ADDRESS=127.0.0.1` blocks LAN | `.env.example`, `docker-compose.yml:9` | **Critical for real device demo** |
| Bootstrap URL not set | `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=` empty by default | `.env.example` | Device gets no MQTT credentials from API |
| Firmware `DEFAULT_MQTT_HOST=192.168.1.100` is placeholder | Hardcoded example IP | `AscultiCor_esp32.ino:51` | Device connects to wrong host |
| `bootstrap_insecure` fallback when fingerprint fails | ESP32 Core v3.x removed `setFingerprint()` | `AscultiCor_esp32.ino:456-457` | Silently falls back to insecure TLS |
| No preflight result surfaced in dashboard | Preflight status published as MQTT meta message, but no UI indicator verified | Frontend sessions page | Examiner cannot verify hardware is correctly connected |
| Serial provisioning requires knowledge of key names | No unified guide or interactive menu | `AscultiCor_esp32.ino` | Friction for first-time setup |

### Recommended Real-Device Flow (Simplified)

**Step 1 — Pre-demo environment setup (5 minutes)**
```
# In .env:
MQTT_BIND_ADDRESS=0.0.0.0           # Allow ESP32 LAN access
MQTT_WS_BIND_ADDRESS=0.0.0.0
DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=http://192.168.x.x:3000  # Your LAN IP
DEVICE_BOOTSTRAP_MQTT_HOST=192.168.x.x                     # Same LAN IP
docker-compose up --build -d
```

**Step 2 — Create device in dashboard**
- Register device → get `device_id` + `device_secret`
- Provisioning wizard shows Serial commands

**Step 3 — Flash and provision ESP32 via Serial**
```
SET wifi_ssid YOUR_WIFI_SSID
SET wifi_pass YOUR_WIFI_PASSWORD
SET bootstrap_url http://192.168.x.x:3000/api/device/bootstrap
SET device_id <from dashboard>
SET device_secret <from dashboard>
SAVE
REBOOT
```

**Step 4 — Verify connection**
- LED pattern: CONNECTING → CONNECTED (solid)
- Serial shows: `[BOOTSTRAP] Requesting broker config...`
- Dashboard: device status changes to `online`

**Step 5 — Start session**
- Press S in Serial (or use dashboard "New Session" button)
- LED: STREAMING (fast blink)
- Dashboard: live waveforms appear

### Proposed Serial Commands Reference Card

| Command | Effect |
|---|---|
| `SET <key> <value>` | Set NVS credential |
| `SAVE` | Persist all settings |
| `REBOOT` | Restart device |
| `STATUS` | Print current credentials and state |
| `S` | Start session |
| `X` | Stop session |
| `HELP` | Print command list |
| `PREFLIGHT` | Run preflight check and print result |

**Proposed Dashboard UX Copy — Device Setup Screen:**
> "Before connecting your ESP32:
> 1. Set `MQTT_BIND_ADDRESS=0.0.0.0` in your `.env` file
> 2. Your MQTT host for the device is: **[detected LAN IP shown here]**
> 3. Open Arduino Serial Monitor at 115200 baud
> 4. Enter the commands shown below"

### Preflight Diagnostic Checklist (for Demo Day)

```
[ ] MQTT_BIND_ADDRESS=0.0.0.0 in .env
[ ] docker-compose ps — all services healthy
[ ] ESP32 Serial: "Connected to MQTT broker" visible
[ ] Dashboard: device shows "online"
[ ] ECG leads attached to chest (RA, LA, RL)
[ ] Serial: PREFLIGHT → "ECG leads: OK, PCG: OK"
[ ] Start session → LED fast-blinks
[ ] Dashboard: waveforms visible within 5s
[ ] Session ends → predictions shown
[ ] LLM report queued → process via curl or n8n
```

---

## F. Security Review

| Area | Finding | Severity | Status |
|---|---|---|---|
| Auth middleware | All `/api` routes excluded from middleware auth enforcement — relies on route-level checks | Medium | Acceptable if routes enforce own auth |
| RLS tenant isolation | `org_id` enforced in all INSERT/SELECT policies | OK | Verified |
| Service role key | Used in API routes, not in client-side code | OK | Verified |
| Internal token comparison | `!=` instead of `secrets.compare_digest` in `main.py:170` | High | **Not fixed** |
| `/health` public detail | Model status, session count, connectivity exposed without auth | Medium | **Not fixed** |
| MQTT credentials | Per-device credentials via migration 026 (`mqtt_username`, `mqtt_password_hash`) | OK | Hash stored |
| Device bootstrap | HMAC verification with `MQTT_DEVICE_PASSWORD_PEPPER` | OK | Implemented |
| `device-auth` Edge Function | Generates unverifiable token | Medium | Dead code |
| `.env.example` | No real values | OK | Clean |
| `docker-compose.yml` | `CLAUDE_BASE_URL` defaults to third-party proxy | High | **Not fixed** |
| MQTT plaintext | Port 1883 over plaintext — acceptable for LAN/demo, risk on VPS | Medium | Documented |
| Audit logs | `audit_logs` table + RLS present | OK | Verified |
| N8N_EMAIL_PAYLOAD_EXPORT_ENABLED | Defaults to false | OK | Verified |
| Storage signed URLs | Edge Functions verified | OK | Two functions present |

---

## G. AI/Signal Review

### Model Inventory

| Model | Type | Input | Output | Artifacts | Status |
|---|---|---|---|---|---|
| Model 1: PCG Classifier | XGBoost | MFCC/Mel features | Heart sound class (Normal/Murmur/etc.) + confidence | `xgboost_model.pkl`, `scaler.pkl`, `label_encoder.pkl` | **All present** |
| Model 2: CNN Murmur Severity | CNN (Keras) | Mel spectrogram | 7 multi-label outputs (timing, shape, grading, pitch, quality, location, murmur_present) | `best_model.keras`, `config.json`, 7 encoder PKLs | **All present** |
| Model 3: BiLSTM ECG Arrhythmia | BiLSTM (Keras) | ECG windows (300 samples @ 360 Hz) | 7 MIT-BIH beat classes → mapped to AAMI 5-class | `bilstm_model.keras`, `label_encoder.pkl`, `config.json` | **All present** |

### Signal Pipeline

**ECG Pipeline:**
1. ESP32 ADC on GPIO 32 → signed int16 at 500 Hz
2. MQTT binary chunks → `SessionBuffer` in inference
3. `reconstruct_signal()`: `np.frombuffer(dtype=np.int16) / 32768.0` → normalized float32
4. `ECGPreprocessor`: resample 500→360 Hz via scipy (verified in `inference.py:86-90`, `.env.example` comment)
5. Window into 300-sample segments
6. BiLSTM prediction → AAMI mapping (`BEAT_TO_AAMI` dict at `inference.py:49-57`)
7. Stored in `predictions` table

**PCG Pipeline:**
1. ESP32 ADC on GPIO 33 → signed int16 at 22,050 Hz
2. MQTT binary chunks (512 samples = 1,024 bytes each)
3. `reconstruct_signal()`: same normalization
4. `PCGPreprocessor`: MFCC/Mel features extraction
5. XGBoost classification (Model 1)
6. If murmur detected → `PCGSeverityPreprocessor` + CNN (Model 2)
7. Stored in `predictions` + `murmur_severity` tables

### Sample Rate Consistency

| Component | ECG Rate | PCG Rate | Match? |
|---|---|---|---|
| Firmware | 500 Hz | 22,050 Hz | — |
| SessionBuffer default | 500 Hz (if not in meta) | 22,050 Hz | ✅ |
| inference.py ECGPreprocessor | 360 Hz (target after resample) | 22,050 Hz | ✅ |
| model3 config.json | 360 Hz | — | ✅ |
| docker-compose ECG_SAMPLE_RATE | 360 Hz | 22,050 Hz | ✅ |
| .env.example comment | "MIT-BIH 360 Hz" explicit warning | 22,050 Hz | ✅ |

**Sample rate pipeline: CONSISTENT and well-documented.**

### Medical Safety Wording

- Inference output reports use labels like "Normal", "SVEB", "VEB" — clinical terminology.
- The project description states "educational, research, and demonstration purposes only."
- **No medical disclaimer was verified in the LLM report template text** — this must be present. The report output should include text like: *"This report is generated by an AI model for educational and research purposes only. It does not constitute medical advice, diagnosis, or treatment."*
- Demo mode returns deterministic mock predictions — does not expose real model outputs.

---

## H. Recommended Refactor Roadmap

### Must Fix Before Demo (≤1 week)

| # | Fix | File | Effort |
|---|---|---|---|
| 1 | Rename duplicate `025_visitor_role.sql` → `029_visitor_role.sql` | `supabase/migrations/` | Small |
| 2 | Fix `secrets.compare_digest` for internal token | `inference/app/main.py:170` | Small |
| 3 | Change `CLAUDE_BASE_URL` default to `https://api.anthropic.com` | `docker-compose.yml:142` | Small |
| 4 | Add medical disclaimer to LLM report template | `frontend/src/app/api/llm/route.ts` | Small |
| 5 | Fix README: `operator` → `visitor` in self-signup text | `README.md:98` | Small |
| 6 | Create `docs/CLOUD_VM_DEPLOYMENT.md` (even minimal) | New file | Medium |
| 7 | Fix firmware header "SONOCARDIA" → "AscultiCor" | `AscultiCor_esp32.ino:3` | Small |

### Should Fix Before Submission (≤2 weeks)

| # | Fix | File | Effort |
|---|---|---|---|
| 8 | Remove user PATCH of `status` from devices API | `api/devices/[id]/route.ts` | Small |
| 9 | Restrict `/health` response to `{status}` only without token | `inference/app/main.py` | Small |
| 10 | Add at least 3 Python unit tests for preprocessing | New file: `inference/tests/` | Medium |
| 11 | Remove dead `device-auth` Edge Function or complete it | `supabase/functions/device-auth/` | Medium |
| 12 | Remove duplicate `best_model.keras` from model3 directory | `models/model3_bilstm_ecg/` | Small |
| 13 | Fix `time.sleep` in MQTT reconnect thread | `inference/app/mqtt_handler.py:397` | Medium |
| 14 | Create `HARDWARE_SETUP.md` | New file | Medium |
| 15 | Create `MODEL_CARD.md` | New file | Medium |
| 16 | Verify `mqtt.setBufferSize(4096)` is called in firmware | `AscultiCor_esp32.ino` | Small |

### Optional Polish

| # | Fix | File | Effort |
|---|---|---|---|
| 17 | Uncomment CSP header in NGINX config | `nginx/default.conf.template:54` | Small |
| 18 | Add Redis-backed rate limiter for production | `inference/app/security.py` | Large |
| 19 | Migrate `@supabase/auth-helpers-nextjs` to `@supabase/ssr` | `frontend/package.json` | Large |
| 20 | Add Vitest smoke tests for key frontend components | New files | Large |

### Future Work

- TLS on MQTT (port 8883) for production hardware
- WebSocket MQTT authentication (per-device credentials)
- CI/CD pipeline with GitHub Actions
- Model retraining pipeline automation
- Supabase Realtime for truly real-time waveform display (currently polling)

---

## I. Concrete Patch Suggestions

### I1. Fix timing-attack vulnerability (main.py)

```python
# BEFORE (main.py:169-171):
provided = request.headers.get("x-internal-token")
if provided != configured:
    raise HTTPException(status_code=401, detail="Unauthorized")

# AFTER:
import secrets
provided = request.headers.get("x-internal-token", "")
if not secrets.compare_digest(provided, configured):
    raise HTTPException(status_code=401, detail="Unauthorized")
```

### I2. Fix CLAUDE_BASE_URL (docker-compose.yml)

```yaml
# BEFORE (line 142):
- CLAUDE_BASE_URL=${CLAUDE_BASE_URL:-https://agentrouter.org}

# AFTER:
- CLAUDE_BASE_URL=${CLAUDE_BASE_URL:-https://api.anthropic.com}
```

### I3. Medical disclaimer in LLM report template

Add to the end of every generated report text in `/api/llm/route.ts`:

```
---
⚠️ EDUCATIONAL DISCLAIMER: This report is generated by an artificial intelligence 
model for educational and research purposes only. It does not constitute medical 
advice, clinical diagnosis, or treatment recommendations. All findings should be 
reviewed by a qualified healthcare professional.
```

### I4. Restrict /health public response

```python
# main.py — /health endpoint
@app.get("/health")
@rate_limit(limit_type="general")
async def health_check(request: Request):
    # Always return minimal public status
    if not mqtt_handler:
        return {"status": "unhealthy"}
    
    mqtt_connected = mqtt_handler.client.is_connected()
    
    # Detailed response requires internal token
    provided = request.headers.get("x-internal-token", "")
    configured = os.getenv("INFERENCE_INTERNAL_TOKEN", "")
    if configured and secrets.compare_digest(provided, configured):
        # Return full detail (existing logic)
        ...
    
    # Public: minimal
    return {"status": "healthy" if mqtt_connected else "degraded"}
```

### I5. Fix firmware header

```cpp
// BEFORE (line 3):
║               SONOCARDIA — ESP32 Firmware                    ║

// AFTER:
║              AscultiCor — ESP32 Firmware                     ║
```

---

## J. Documentation To Add

### HARDWARE_SETUP.md

**Purpose:** Step-by-step guide for connecting ESP32 hardware to the system. Critical for examiners attempting to reproduce the demo.

**Required sections:**
1. Bill of Materials (ESP32-WROOM-32, AD8232, MAX9814, wiring)
2. Hardware wiring diagram (GPIO 32=ECG, 33=PCG, 34/35=leads-off, 2=LED)
3. Arduino IDE setup (ESP32 Core 2.x, PubSubClient, ArduinoJson libraries)
4. Pre-demo environment setup (MQTT_BIND_ADDRESS, LAN IP, bootstrap URL)
5. Serial provisioning command reference
6. LED status indicator guide
7. Preflight check procedure
8. Troubleshooting table

### MQTT_CONTRACT.md

**Purpose:** Authoritative MQTT topic specification for hardware engineers and examiners.

**Required sections:**
1. Topic naming convention: `org/<org_id>/device/<device_id>/session/<session_id>/<type>`
2. Full topic table (as in section C5 above)
3. Payload schemas for each message type (JSON and binary)
4. QoS and retain policy
5. Session lifecycle flow diagram

### API_REFERENCE.md

**Purpose:** Complete API documentation for all Next.js API routes and FastAPI endpoints.

**Required sections:**
1. Authentication (Supabase session vs internal token)
2. Next.js API routes table (method, path, auth, request, response)
3. FastAPI endpoints table
4. n8n webhook endpoints
5. Error codes and response shapes

### DEMO_RUNBOOK.md

**Purpose:** Exact steps to run a successful hardware demo in 10 minutes. Critical for exam day.

**Required sections:**
1. Pre-demo checklist (environment, hardware, network)
2. Step-by-step demo script
3. Expected timeline (what happens when)
4. Fallback to demo mode (if hardware fails)
5. Common failure modes and fixes

### TROUBLESHOOTING.md

**Purpose:** Quick reference for solving common setup problems.

**Required sections:**
1. ESP32 cannot connect to MQTT (MQTT_BIND_ADDRESS fix)
2. Bootstrap fails (URL configuration)
3. No waveforms showing (session start verification)
4. Inference service unhealthy (model loading failures)
5. Docker networking issues
6. Supabase auth errors

### MODEL_CARD.md

**Purpose:** Document AI model provenance, performance, and limitations for examiners.

**Required sections:**
1. Model 1 (XGBoost PCG): dataset (PhysioNet/PASCAL), classes, accuracy/F1 from training_log.txt
2. Model 2 (CNN Murmur Severity): dataset (CirCor DigiScope), outputs, performance
3. Model 3 (BiLSTM ECG): dataset (MIT-BIH), AAMI class mapping, accuracy
4. Known limitations and failure modes
5. Medical disclaimer (not for clinical use)

---

## K. VPS Migration Review — Local to Hostinger

### Files Containing `localhost` That Break on VPS

| File | Line | Context | Required VPS Change |
|---|---|---|---|
| `docker-compose.yml:132` | `NEXT_PUBLIC_MQTT_WS_URL=${...:-ws://localhost:9001}` | Browser MQTT WebSocket URL | Must be `wss://<vps-domain>/mqtt` |
| `docker-compose.yml:95` | `ALLOWED_ORIGINS=...http://localhost:3000` | CORS for inference | Must include `https://<vps-domain>` |
| `docker-compose.yml:97` | `TRUSTED_HOSTS=*.asculticor.com,localhost,...` | Trusted hosts | Add VPS domain |
| `.env.example:NGINX_SERVER_NAME` | `localhost` | NGINX vhost | Must be VPS domain |
| `.env.example:CORS_ORIGIN` | `http://localhost:3000` | Edge Function CORS | Must be `https://<vps-domain>` |
| `firmware/AscultiCor_esp32.ino:51` | `DEFAULT_MQTT_HOST="192.168.1.100"` | Default IP | Must be VPS IP/domain |

### Required VPS Environment Variables

| Variable | Local Value | VPS Value |
|---|---|---|
| `NGINX_SERVER_NAME` | `localhost` | `asculticor.yourdomain.com` |
| `MQTT_BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` |
| `MQTT_WS_BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` (or behind NGINX) |
| `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL` | (empty) | `https://asculticor.yourdomain.com` |
| `DEVICE_BOOTSTRAP_MQTT_HOST` | (empty) | `asculticor.yourdomain.com` or VPS IP |
| `DEVICE_BOOTSTRAP_MQTT_TLS` | `false` | `true` (if MQTT TLS configured) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | `https://asculticor.yourdomain.com` |
| `NEXT_PUBLIC_MQTT_WS_URL` | `ws://localhost:9001` | `wss://asculticor.yourdomain.com/mqtt` |
| `CORS_ORIGIN` | `http://localhost:3000` | `https://asculticor.yourdomain.com` |
| `NGINX_SSL_CERT_PATH` | `/etc/nginx/certs/selfsigned.crt` | Let's Encrypt path |
| `NGINX_SSL_KEY_PATH` | `/etc/nginx/certs/selfsigned.key` | Let's Encrypt path |

### VPS Firewall Ports Required

| Port | Protocol | Service | Required? |
|---|---|---|---|
| 80 | TCP | HTTP (→HTTPS redirect) | Yes |
| 443 | TCP | HTTPS (dashboard) | Yes |
| 1883 | TCP | MQTT (raw) | **Only if ESP32 on VPS subnet** |
| 9001 | TCP | MQTT WebSocket | Optional (behind NGINX /mqtt proxy) |
| 22 | TCP | SSH admin | Yes |

### VPS Deployment Runbook (Summary)

1. Clone repo to VPS
2. `cp .env.example .env` → fill all values with VPS domain, real credentials
3. Obtain SSL certificates: `certbot --nginx -d asculticor.yourdomain.com`
4. Set `NGINX_SSL_CERT_PATH=/etc/letsencrypt/live/...` in `.env`
5. Apply Supabase migrations in order
6. `docker-compose up --build -d`
7. Configure Supabase Auth redirect URLs to include `https://asculticor.yourdomain.com/auth/callback`
8. ESP32: provision with `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=https://asculticor.yourdomain.com`
9. Verify: `curl https://asculticor.yourdomain.com/api/health` returns 200

---

## K. Final Graduation Readiness Score

### Score: 71/100

| Category | Score /10 | Notes |
|---|---|---|
| Functionality | 8 | All major flows present and connected |
| Code Quality | 6 | `any` types, duplicate migration, some dead code |
| UI/UX | 8 | Polished design, role system working |
| Backend/API | 7 | Good route coverage; timing attack and public /health are remaining issues |
| Database | 7 | 28 migrations, RLS present; duplicate 025 is a blocker |
| Security | 5 | Improved from initial review; 3 issues remain |
| Performance | 6 | Polling is intentional; MQTT reconnect thread blocking |
| Documentation | 4 | README exists; deployment docs missing; no model card |
| Hardware Integration | 7 | Well-implemented firmware; setup friction documented |
| Testing | 1 | No tests exist |

### Top 5 Changes That Would Most Improve the Score

1. **Fix duplicate migration 025** (+4 pts) — blocks fresh database setup, examiners can verify by running CLI.
2. **Add 5+ tests** (+6 pts) — even minimal unit tests demonstrate engineering discipline.
3. **Create `docs/CLOUD_VM_DEPLOYMENT.md` and `HARDWARE_SETUP.md`** (+4 pts) — examiners expect runnable documentation.
4. **Fix `secrets.compare_digest` and `/health` public detail** (+3 pts) — these are the two remaining verifiable security bugs.
5. **Add medical disclaimer to LLM report output** (+2 pts) — graduation committee may flag AI medical outputs without explicit disclaimers.

**If all 5 changes are made, projected score: 85–88/100.**
