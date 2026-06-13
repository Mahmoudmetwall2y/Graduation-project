# AscultiCor Graduation Project Review

## A. Executive Summary

AscultiCor is an ambitious graduation project: real ESP32 hardware, MQTT ingestion, Python/FastAPI inference, Supabase Auth/Postgres/RLS/storage, Next.js dashboard, n8n automation, Docker/Nginx deployment, and ML model artifacts. The scope is impressive, but it is **not ready for submission yet** because the project currently has serious security, verification, documentation, and deployment-readiness problems.

**Overall readiness: 62%**

**Graduation submission status:** Not ready, major fixes needed.

| Area | Rating / 10 | Notes |
|---|---:|---|
| Functionality | 7 | Strong feature set, but runtime could not be verified and several flows depend on fragile config. |
| Code Quality | 6 | Mostly organized, but many broad `any` types, duplicated helpers, mojibake text, weak validation. |
| UI/UX | 7 | Polished dashboard direction, but consistency/accessibility/mobile verification is incomplete. |
| Backend | 6 | Useful API routes, but some endpoints leak operational info or use overprivileged service role. |
| Database | 7 | Good multi-tenant RLS effort, but migrations are messy and docs contradict realtime state. |
| Security | 3 | Real secrets are committed in `env`; public health endpoint leaks internals; raw MQTT exposed. |
| Performance | 6 | Polling is intentional, but live metrics/storage can grow and n8n has N+1 query patterns. |
| Documentation | 6 | Many docs exist, but some referenced files are missing/stale and secrets are present. |
| Graduation Presentation Quality | 7 | Impressive concept, but examiners will punish exposed secrets and unverifiable tests. |

Final verdict: **Not ready, major fixes needed.** The biggest strength is the full system architecture. The biggest weakness is security hygiene and lack of runnable verification evidence.

---

## B. Critical Bugs

| Severity | File / Location | Problem | Why It Matters | Exact Fix |
|---|---|---|---|---|
| Critical | `env` | Contains real-looking Supabase service role key, anon key, MQTT password, internal tokens, Claude key, n8n credentials, domain/IP. | A service-role Supabase key can bypass RLS and compromise the database. | Rotate every exposed credential, remove `env` from Git history, add `env` to `.gitignore` as a file, keep only `.env.example`. |
| Critical | `frontend/src/app/api/health/route.ts`, `frontend/src/middleware.ts:33` | `/api/health` is public because middleware excludes all `/api`; it uses service role and returns device/session/model/service details. | Anonymous users can enumerate operational health, model status, device counts, queue status. | Require admin auth or internal token for detailed health; expose only `{status}` publicly. |
| High | `frontend/src/app/api/sessions/[id]/start/route.ts:303` | Hardcoded fallback MQTT password. | If env is missing, production may silently use a known credential. | Remove fallback; fail with 500 when `MQTT_PASSWORD` is missing. |
| High | `nginx/default.cloud.conf.template:72` | `/api/inference/` publicly proxies the inference service. | Even with internal tokens on some routes, `/health` and root expose service details. | Remove public inference proxy or restrict it by IP/internal auth. |
| High | `mosquitto/config/mosquitto.conf`, `env` | Raw MQTT exposed on `0.0.0.0:1883` without TLS in cloud env. | Device traffic and credentials can be intercepted. | Use TLS MQTT on 8883 or VPN/private network; disable public plaintext MQTT. |
| High | `frontend/src/app/api/devices/[id]/route.ts:178` | PATCH allows user-controlled `status`. | A user can mark a device online/offline/error manually, corrupting operational truth. | Remove `status` from user PATCH; status should come from device/inference service only. |
| Medium | `supabase/README.md:79` vs `README.md:93` | Supabase README says enable realtime; main README says realtime disabled. | Examiners will see contradictory architecture. | Update docs to one truth: polling/free-tier path or realtime path. |
| Medium | `supabase/functions/device-auth/index.ts` | Returns a random device token but does not persist or validate it anywhere later. | Looks like security theater; no real token lifecycle. | Either remove token or store hashed token with expiry and validate it on device APIs. |
| Medium | `.github`, tests | No project-owned tests found; npm/python unavailable locally. | Cannot prove correctness before submission. | Add tests and CI evidence; install toolchain or document verified CI runs. |

---

## C. Detailed File-by-File Review

### File: `env`

**Purpose:** Production/cloud environment configuration.

**Problems found:** Contains real secrets and deployment identifiers. `.gitignore` ignores `.env` and `env/`, but not a file named `env`, so this file is tracked.

**Suggested fixes:** Rotate all keys immediately. Rename local secret file to `.env`, delete tracked `env`, add `env` to `.gitignore`, and verify with `git ls-files env`.

**Improvement opportunities:** Add `.env.production.example` with placeholder values only.

### File: `.gitignore`

**Purpose:** Ignore generated files/secrets.

**Problems found:** `env/` ignores a folder, not the tracked `env` file.

**Suggested fixes:** Add:

```gitignore
env
*.env
```

Keep `.env.example` explicitly allowed if needed.

### File: `README.md`

**Purpose:** Main project overview and setup.

**Problems found:** References `RELEASE_CHECKLIST.md`, but I did not see that file. Links point to old absolute paths like `d:/cardiosense-project/cardiosense/...`. Mentions `simulator/`, but no simulator folder exists in current inventory.

**Suggested fixes:** Replace absolute links with relative links, remove missing simulator reference, add real demo credentials policy, testing evidence, screenshots, architecture diagram links, and security rotation steps.

### File: `frontend/package.json`

**Purpose:** Frontend dependencies/scripts.

**Problems found:** No test script. Uses `next lint`, which is deprecated in newer Next versions but still works in Next 14. Dependency `@supabase/auth-helpers-nextjs` is older/deprecated compared with current SSR helpers.

**Suggested fixes:** Add `test`, `test:e2e`, and migrate auth helpers later.

### File: `frontend/src/middleware.ts`

**Purpose:** Route protection.

**Problems found:** All `/api` routes are excluded from auth enforcement. That is acceptable only if every API route enforces auth itself; `/api/health` does not.

**Suggested fixes:** Keep API exclusion only for public endpoints or add route-level auth/internal-token checks consistently.

### File: `frontend/src/app/api/health/route.ts`

**Purpose:** Aggregated health endpoint.

**Problems found:** Uses service role and returns detailed operational metadata publicly.

**Suggested fixes:** Split into `/api/health/public` and `/api/admin/health`; protect admin health with session role or `x-internal-token`.

### File: `frontend/src/app/api/devices/route.ts`

**Purpose:** List/create devices.

**Problems found:** Good admin check for create. Validation is minimal: `device_name`, `device_type`, `notes`, `sensor_config` are not length/type validated. Device name uniqueness errors become generic 500.

**Suggested fixes:** Validate body with Zod; return 409 for duplicate device names; cap notes/config size.

### File: `frontend/src/app/api/devices/[id]/route.ts`

**Purpose:** Device detail/update/delete.

**Problems found:** Allows updating `status`; broad `any`; no UUID validation; delete cascades may remove sessions/recordings/predictions.

**Suggested fixes:** Remove `status` from `allowedUpdates`; validate UUID and payload; consider soft-delete for devices.

### File: `frontend/src/app/api/device/bootstrap/route.ts`

**Purpose:** Device bootstrap credential exchange.

**Problems found:** No rate limiting; device credentials can be brute-forced; returns MQTT password on every valid bootstrap.

**Suggested fixes:** Add IP/device rate limiting, audit failed attempts, optional one-time bootstrap expiry, and per-device credential rotation.

### File: `frontend/src/app/api/sessions/[id]/start/route.ts`

**Purpose:** Start hardware capture via MQTT.

**Problems found:** Hardcoded MQTT password fallback; command broker alignment is fragile; no UUID validation for route param.

**Suggested fixes:** Require `MQTT_USERNAME`/`MQTT_PASSWORD`; validate session UUID; fail explicitly when broker config is missing.

### File: `frontend/src/app/api/sessions/[id]/live/route.ts` and `stream/route.ts`

**Purpose:** Poll/SSE live waveform frames.

**Problems found:** Good org authorization. SSE polls every 80 ms, which can become expensive with many users. Uses service role for preview downloads.

**Suggested fixes:** Increase polling interval or batch frames; add server-side max stream duration; add observability.

### File: `frontend/src/app/api/sessions/[id]/summary/route.ts`

**Purpose:** Session summary API.

**Problems found:** Good auth/org check. Returns audit events to any org user, while DB RLS normally restricts audit logs to admins. Because route uses user client, this may fail for non-admins.

**Suggested fixes:** Either remove audit events for non-admins or explicitly check role.

### File: `frontend/src/app/api/llm/route.ts`

**Purpose:** Queue/process LLM reports.

**Problems found:** Queueing is reasonable. Processing endpoint returns `emails` array including generated email text/report content. With a leaked internal token, sensitive report text is exposed. Claude fallback silently generates demo report, which can mislead presentation.

**Suggested fixes:** Return email counts only, not full bodies. Clearly label real LLM vs demo in UI/report. Add provider timeout.

### File: `frontend/src/app/api/n8n/workflows/route.ts`

**Purpose:** Internal automation actions.

**Problems found:** Uses service role and internal token. Has N+1 queries in clinical alerts and summary enrichment. Hardcoded public URL fallback to project host.

**Suggested fixes:** Remove hardcoded host fallback; batch query sessions/predictions; return only summaries.

### File: `frontend/src/app/auth/login/page.tsx`

**Purpose:** Login/signup/reset UI.

**Problems found:** Signup can be enabled even when onboarding is not defensible. Password minimum is only 6 characters. Some text has encoding corruption.

**Suggested fixes:** Disable public signup unless `DEFAULT_SIGNUP_ORG_ID` is configured; require stronger passwords; fix encoding.

### File: `frontend/src/app/auth/callback/route.ts`

**Purpose:** Auth callback and profile provisioning.

**Problems found:** Uses service role to auto-provision users into the only org. This is convenient but risky for a clinical-style app.

**Suggested fixes:** For graduation, document this as demo onboarding only; production should use invite/admin approval.

### File: `frontend/src/app/components/Navbar.tsx`

**Purpose:** Navigation/sidebar.

**Problems found:** Shows `/debug` link, but no `frontend/src/app/debug` route was in the file inventory.

**Suggested fixes:** Remove `/debug` from nav or implement protected debug page.

### File: `frontend/src/app/patients/page.tsx`

**Purpose:** Patient management.

**Problems found:** Client inserts patient directly through Supabase. RLS helps, but validation is weak: no DOB sanity, email normalization, note length cap.

**Suggested fixes:** Add API route or shared schema validation; validate DOB not future; normalize email.

### File: `frontend/src/app/session/new/page.tsx`

**Purpose:** Create and start sessions.

**Problems found:** If start command fails, session remains `created`, causing clutter/stale state.

**Suggested fixes:** On start failure, update session to `error` or delete the just-created session after confirmation.

### File: `supabase/migrations/*`

**Purpose:** Database schema/RLS evolution.

**Problems found:** Strong RLS effort, but migration numbering has duplicate `024_*` files. One-shot `apply_this_in_supabase.sql` duplicates migration logic. Realtime docs contradict disabled realtime migrations.

**Suggested fixes:** Renumber migrations uniquely; document exactly one bootstrap path; verify fresh DB apply from zero.

### File: `supabase/seed.sql`

**Purpose:** Demo seed data.

**Problems found:** Contains default admin email/password guidance and fixed device secret comment.

**Suggested fixes:** Keep only placeholders or make clear these are local-only; do not include real demo passwords for public submission.

### File: `supabase/functions/device-auth/index.ts`

**Purpose:** Device auth edge function.

**Problems found:** Token is generated but not stored. No brute-force protection.

**Suggested fixes:** Store hashed token in `device_api_keys` or remove token from response.

### File: `supabase/functions/signed-upload-url/index.ts`

**Purpose:** Signed upload URL.

**Problems found:** Does not verify `session_id` belongs to the authenticated user’s org before creating upload path.

**Suggested fixes:** Query `sessions` by `id` and `org_id` before signing upload.

### File: `supabase/functions/signed-download-url/index.ts`

**Purpose:** Signed download URL.

**Problems found:** Org path check is good, but no check that object corresponds to an accessible recording row.

**Suggested fixes:** Validate `recordings.storage_path` exists for user org.

### File: `inference/app/main.py`

**Purpose:** FastAPI service.

**Problems found:** `/health` is public; docs disabled by default, good. In-memory rate limiter is not distributed and can grow.

**Suggested fixes:** Keep `/health` minimal; protect details; use Redis/proxy rate limit for production.

### File: `inference/app/mqtt_handler.py`

**Purpose:** MQTT ingestion/buffering/inference trigger.

**Problems found:** Large complex file; buffer limit exists, good. Needs integration tests for malformed topics, oversized payloads, duplicate meta, disconnect/reconnect.

**Suggested fixes:** Split topic parsing/session state/inference trigger into testable modules.

### File: `inference/app/supabase_client.py`

**Purpose:** DB/storage wrapper.

**Problems found:** Good wrapper, but service-role client means bugs bypass RLS. Errors often return false instead of typed failure.

**Suggested fixes:** Add structured error objects and tests for every DB write.

### File: `mosquitto/config/mosquitto.conf`

**Purpose:** MQTT broker config.

**Problems found:** Auth enabled, anonymous disabled, good. Plain MQTT still used.

**Suggested fixes:** Add TLS listener for production and disable public 1883.

### File: `nginx/default.cloud.conf.template`

**Purpose:** Cloud reverse proxy.

**Problems found:** No security headers at Nginx layer; inference proxy exposed; n8n exposed on 8443.

**Suggested fixes:** Add HSTS/CSP/security headers; restrict n8n and inference by auth/IP/VPN.

### File: `firmware/asculticor_esp32/AscultiCor_esp32.ino`

**Purpose:** ESP32 capture/provisioning firmware.

**Problems found:** Rich implementation, but file has severe encoding corruption. Defaults are placeholders, good. Need Arduino compile proof.

**Suggested fixes:** Re-save as UTF-8; add firmware build instructions and screenshot/serial evidence.

### File: `.github/workflows/process-llm-queue.yml`

**Purpose:** Scheduled queue processor.

**Problems found:** Good use of GitHub secrets. Curl does not fail on non-2xx unless inspected.

**Suggested fixes:** Add `--fail-with-body` and log status safely.

---

## D. Feature-by-Feature Review

### Feature: Authentication and Onboarding

| Check | Result | Notes |
|---|---|---|
| Works correctly | Partial | Supabase login/signup implemented. |
| Handles edge cases | Partial | Multiple org handling exists, but signup policy is risky. |
| UI complete | Pass | Login/reset/signup UI present. |
| Backend complete | Partial | Profile auto-provision uses service role. |
| Database correct | Partial | Profiles/RLS present. |
| Graduation quality | Partial | Must explain invite vs demo self-signup. |

Recommendation: disable signup for demo unless explicitly needed.

### Feature: Device Management and Provisioning

| Check | Result | Notes |
|---|---|---|
| Works correctly | Partial | Device create/bootstrap exists. |
| Handles edge cases | Partial | Missing brute-force limits and schema validation. |
| UI complete | Pass | Provisioning wizard exists. |
| Backend complete | Partial | Per-device MQTT credentials supported. |
| Database correct | Pass | Credential columns and constraints exist. |
| Graduation quality | Partial | Needs TLS/rotation story. |

### Feature: Real-Time Session Capture

| Check | Result | Notes |
|---|---|---|
| Works correctly | Partial | MQTT start and ACK flow exists. |
| Handles edge cases | Partial | Failed start leaves stale session. |
| UI complete | Pass | New session flow present. |
| Backend complete | Partial | Broker config fragile. |
| Database correct | Pass | Session/recording tables present. |
| Graduation quality | Pass | Strong demo feature if tested live. |

### Feature: ML Inference

| Check | Result | Notes |
|---|---|---|
| Works correctly | Insufficient data to verify | Could not run Python; model runtime unverified. |
| Handles edge cases | Partial | Buffer limits exist. |
| UI complete | Pass | Prediction cards exist. |
| Backend complete | Partial | Needs tests/log evidence. |
| Database correct | Pass | Predictions and model version fields exist. |
| Graduation quality | Pass | Strong if validation metrics are documented. |

### Feature: LLM Reports

| Check | Result | Notes |
|---|---|---|
| Works correctly | Partial | Queue/process implemented. |
| Handles edge cases | Partial | Retry exists; provider fallback may hide failures. |
| UI complete | Partial | Reports page exists. |
| Backend complete | Partial | Email payloads returned from internal API. |
| Database correct | Pass | `llm_reports` with retries. |
| Graduation quality | Partial | Must label as educational, not diagnosis. |

### Feature: Patients and Notes

| Check | Result | Notes |
|---|---|---|
| Works correctly | Partial | UI and tables exist. |
| Handles edge cases | Partial | Weak validation. |
| UI complete | Pass | Patient list/add/delete present. |
| Backend complete | Partial | Mostly direct client Supabase operations. |
| Database correct | Pass | MRN migration exists. |
| Graduation quality | Pass | Good clinical workflow addition. |

### Feature: Alerts and n8n Automation

| Check | Result | Notes |
|---|---|---|
| Works correctly | Insufficient data to verify | Workflows exist but not executed. |
| Handles edge cases | Partial | Duplicate alert checks exist. |
| UI complete | Partial | Alerts page exists. |
| Backend complete | Partial | N+1 queries and hardcoded fallback host. |
| Database correct | Pass | Alert tables exist. |
| Graduation quality | Partial | Good optional demo, not core. |

---

## E. Security Review

| Risk | Severity | Evidence | Fix |
|---|---|---|---|
| Exposed production secrets | Critical | `env` contains real-looking service-role/API/internal/n8n credentials. | Rotate, purge, ignore. |
| Public detailed health endpoint | High | `/api` excluded by middleware; health uses service role. | Protect detailed health. |
| Public plaintext MQTT | High | Cloud env exposes `1883`, TLS false. | Use TLS/VPN/private broker. |
| Hardcoded MQTT fallback password | High | `start/route.ts:303`. | Remove fallback. |
| Inference proxy exposed | High | Nginx `/api/inference/`. | Restrict/remove. |
| Weak bootstrap brute-force protection | Medium | No rate limit in bootstrap route. | Add rate limiting and failed-attempt audit. |
| Upload URL authorization gap | Medium | Signed upload checks profile only, not session ownership. | Validate session belongs to org. |
| Device auth token unused | Medium | Generated token is not persisted. | Implement real token lifecycle. |
| CSP allows unsafe inline/eval | Medium | `env` CSP includes unsafe directives. | Tighten CSP after UI audit. |
| Dependency risk | Medium | Could not run audit; npm unavailable. | Run `npm audit`, `pip-audit`, document results. |

---

## F. UI/UX Review

| UI Area | Issue | Impact | Fix |
|---|---|---|---|
| Navigation | `/debug` link appears but route not found. | Broken evaluator click path. | Remove or implement protected page. |
| Text encoding | Many files show mojibake characters. | Looks unprofessional in source/docs; may render badly. | Re-save files as UTF-8. |
| Login | Public signup may not match clinical admin workflow. | Examiners may question data access. | Present invite/admin onboarding. |
| Device status | User PATCH can edit status. | UI can show fake online state. | Make status read-only from telemetry. |
| Empty/error states | Many exist, good. | Strong presentation point. | Add screenshots of failure recovery. |
| Accessibility | Some dialogs have ARIA, but full keyboard testing unverified. | Graduation polish risk. | Run Lighthouse/axe and fix violations. |
| Mobile | Responsive classes exist. | Insufficient data to verify actual screenshots. | Capture mobile screenshots before submission. |

Professional presentation upgrades: remove debug routes, fix encoding, prepare a clean seeded demo, add a “System Health” admin-only page, show model confidence/version clearly, and include a clinical disclaimer banner.

---

## G. Database Review

| Database Area | Problem | Risk | Fix |
|---|---|---|---|
| Migration order | Duplicate `024_*` migration names. | Confusion and missed migration. | Rename sequentially. |
| One-shot SQL | `apply_this_in_supabase.sql` duplicates migrations. | Drift between bootstrap paths. | Generate one-shot from migrations or remove it. |
| RLS | Strong overall, but service-role routes bypass RLS. | App bugs can cross tenant boundaries. | Use service role only for backend-only writes. |
| Audit logs | Insert policies were corrected later. | Incremental DBs may drift if migrations skipped. | Fresh migration test from empty DB. |
| Deletes | Device cascade deletes related records. | Accidental data loss. | Prefer soft-delete/archive. |
| Realtime | Docs conflict with disabled realtime migrations. | Confusing architecture defense. | Pick polling or realtime and document clearly. |
| Indexes | Good core indexes. | Need query plan proof for dashboards. | Add EXPLAIN screenshots for common queries. |

---

## H. API Review

| Method | Endpoint | Status | Problems | Fix |
|---|---|---|---|---|
| GET | `/api/health` | Risky | Public detailed service/device/model info. | Public minimal health; admin detailed health. |
| GET | `/api/devices` | Partial | Auth OK; validation not relevant; returns role. | Fine, add pagination for large fleets. |
| POST | `/api/devices` | Partial | Weak payload validation. | Zod schema, 409 duplicate handling. |
| GET | `/api/devices/[id]` | Partial | No UUID validation. | Validate param. |
| PATCH | `/api/devices/[id]` | Risky | Allows user editing `status`. | Remove `status`. |
| DELETE | `/api/devices/[id]` | Partial | Cascade delete risk. | Soft delete. |
| POST | `/api/device/bootstrap` | Risky | No rate limit; returns MQTT secret repeatedly. | Rate limit, rotate/expire bootstrap. |
| POST | `/api/sessions/[id]/start` | Risky | Hardcoded MQTT fallback. | Require env, validate UUID. |
| GET | `/api/sessions/[id]/live` | Partial | Polling cost. | Batch/throttle. |
| GET | `/api/sessions/[id]/stream` | Partial | Long stream resource use. | Add max duration/connection limits. |
| GET | `/api/sessions/[id]/summary` | Partial | Audit events may fail for non-admin. | Role-aware events. |
| POST | `/api/llm` | Partial | Good queue, weak type validation. | Zod schema. |
| POST | `/api/llm?action=process-pending` | Risky | Returns email bodies. | Return counts only. |
| GET | `/api/llm` | Partial | Auth OK. | Pagination. |
| POST | `/api/n8n/workflows` | Partial | Service role, hardcoded host fallback. | Batch queries, remove hardcoded host. |

---

## I. Testing Review

| Test Type | Missing Test | Why Needed | Example Test Case |
|---|---|---|---|
| Unit | Device credential derivation | Prevent broker auth regressions. | Same device/secret derives same MQTT password. |
| Unit | Session duration sanitizer | Hardware timing correctness. | 1 sec becomes 8; 90 sec becomes 60. |
| API | Auth protection | Prevent data leaks. | Anonymous `/api/devices` returns 401. |
| API | Health endpoint | Current risk. | Anonymous detailed health is blocked. |
| API | Bootstrap brute force | Device security. | 10 bad secrets returns 429. |
| Integration | Start session | Core demo flow. | Online device gets MQTT command and session changes. |
| Database | RLS tenant isolation | Graduation defense. | User from org A cannot read org B patients. |
| UI | Login/new session/device wizard | Demo reliability. | Playwright creates session with mock API. |
| Security | Secret scanning | Prevent recurrence. | CI fails if JWT/API key patterns found. |
| Manual | Real ESP32 capture | Main proof. | 15-sec PCG/ECG capture produces recordings and predictions. |

Automated checks attempted: `npm run typecheck`, `npm run lint`, and `python -m compileall app`. They could not run because `npm` and `python` are not available in this environment. **Insufficient data to verify build correctness.**

---

## J. Documentation Review

| Documentation Section | Status | Fix |
|---|---|---|
| Problem statement | Partial | Add one academic paragraph explaining clinical/educational need. |
| Objectives | Partial | Add measurable objectives. |
| Features | Pass | README lists features. |
| Tech stack | Partial | Make a clean table. |
| Architecture | Partial | Docs exist, but add final diagram image. |
| Setup steps | Partial | Fix stale paths and missing files. |
| Environment variables | Partial | Good examples, but tracked `env` violates policy. |
| Database setup | Partial | Resolve realtime contradiction. |
| Running locally | Partial | Docker steps present. |
| Deployment | Pass | Cloud docs exist. |
| Screenshots | Insufficient data to verify | Add dashboard/device/session/report screenshots. |
| Demo credentials | Partial | Do not publish real passwords; provide controlled demo instructions. |
| API documentation | Partial | Add endpoint table. |
| Testing instructions | Weak | Add test commands and expected outputs. |
| Known limitations | Weak | Add medical disclaimer, model limitations, hardware constraints. |
| Future work | Partial | Docs mention roadmap. |

---

## K. Graduation Defense Preparation

| Examiner Question | Strong Answer |
|---|---|
| Why MQTT instead of HTTP streaming? | MQTT is lightweight for ESP32, supports pub/sub topics, QoS, retained status, and decouples device capture from inference/dashboard consumers. |
| How do you isolate organizations? | Supabase Auth identifies users, profiles map users to organizations, and RLS policies filter tables by `org_id`. Backend service-role use is limited to server-only ingestion/automation. |
| What happens if a device is compromised? | The intended design uses per-device MQTT credentials and topic ACLs, so a compromised device should only access its own namespace. Credential rotation is required after compromise. |
| Is this a medical diagnosis? | No. It is an educational/research decision-support prototype. Reports explicitly warn that clinicians must verify findings. |
| How do you validate the ML models? | Validation artifacts exist in `models/validation` and training scripts, but the final submission should include dataset split, confusion matrices, metrics, and limitations. |
| Why Supabase? | It provides managed Postgres, Auth, storage, and RLS, which lets a graduation team implement secure multi-tenant workflows quickly. |
| What is the biggest limitation? | Clinical validity and real-world sensor noise. The project demonstrates an end-to-end prototype, not certified diagnosis. |
| How do you deploy securely? | Docker Compose behind Nginx with TLS, private internal services, environment secrets, RLS, MQTT authentication, and internal tokens. Current plaintext MQTT must be hardened before production. |
| How do you handle failed captures? | Firmware preflight checks ECG/PCG signal quality, publishes failure metadata, and the UI shows actionable errors. |
| Why are secrets not in code? | They should not be. The current tracked `env` file must be removed and all exposed credentials rotated before submission. |

---

## L. Improvement Roadmap

### Must Fix Before Submission

| Priority | Task | Estimated Difficulty | Impact |
|---|---|---|---|
| Must | Rotate exposed secrets and remove `env` from Git. | Medium | Critical security fix. |
| Must | Remove hardcoded MQTT fallback password. | Easy | Prevents unsafe default auth. |
| Must | Protect `/api/health` detailed output. | Easy | Stops public information leak. |
| Must | Fix README missing/stale links. | Easy | Prevents examiner confusion. |
| Must | Add test/build evidence. | Medium | Makes project defensible. |
| Must | Fix encoding corruption in code/docs. | Medium | Professional polish. |

### Should Fix If There Is Time

| Priority | Task | Estimated Difficulty | Impact |
|---|---|---|---|
| Should | Add Zod validation for API bodies. | Medium | Reduces runtime bugs. |
| Should | Remove user-editable device status. | Easy | Protects data integrity. |
| Should | Add rate limiting to bootstrap. | Medium | Security improvement. |
| Should | Renumber duplicate migrations. | Medium | Cleaner DB story. |
| Should | Add Playwright demo flow test. | Medium | Demo confidence. |

### Nice to Have

| Priority | Task | Estimated Difficulty | Impact |
|---|---|---|---|
| Nice | Admin-only system health page. | Medium | Impresses examiners. |
| Nice | Model card documentation. | Medium | Strong AI defense. |
| Nice | Lighthouse accessibility report. | Easy | UI polish proof. |
| Nice | Soft-delete devices. | Medium | Safer data lifecycle. |

---

## M. Final Checklist

- [ ] Code runs without errors
- [ ] No exposed secrets
- [ ] All exposed keys rotated
- [ ] `env` removed from Git tracking
- [ ] Environment variables documented with placeholders only
- [ ] Database migrations apply cleanly from empty DB
- [ ] Duplicate migration numbering fixed
- [ ] README links fixed
- [ ] Missing referenced docs either added or removed
- [ ] Screenshots included
- [ ] Demo account works
- [ ] Real ESP32 demo tested
- [ ] MQTT broker secured or clearly marked demo-only
- [ ] `/api/health` no longer leaks internals
- [ ] All main features tested
- [ ] Deployment works
- [ ] Mobile responsive screenshots captured
- [ ] Model validation metrics documented
- [ ] Medical disclaimer visible in reports
- [ ] Presentation ready
- [ ] Backup prepared

---

## Top 10 Most Important Fixes

| Rank | Fix | Reason |
|---:|---|---|
| 1 | Rotate and remove all secrets in `env`. | Current highest-risk issue. |
| 2 | Protect detailed `/api/health`. | Public operational leak. |
| 3 | Remove hardcoded MQTT password fallback. | Unsafe hidden default. |
| 4 | Secure MQTT with TLS/VPN or mark local-only. | Plaintext cloud MQTT is not defensible. |
| 5 | Add build/typecheck/test proof. | Submission must be verifiable. |
| 6 | Fix README stale/missing links. | Examiners will follow docs. |
| 7 | Remove user-editable device `status`. | Prevents false device state. |
| 8 | Add bootstrap rate limiting. | Protects device credentials. |
| 9 | Fix encoding corruption. | Professional presentation quality. |
| 10 | Resolve realtime documentation contradiction. | Architecture must be defensible. |

## Top 10 Improvements to Impress Examiners

| Rank | Improvement | Why It Helps |
|---:|---|---|
| 1 | Add a polished architecture diagram. | Makes complex system understandable. |
| 2 | Add model cards for each ML model. | Shows AI maturity and limitations. |
| 3 | Add real demo run screenshots. | Proves functionality. |
| 4 | Add RLS isolation test evidence. | Strong security defense. |
| 5 | Add Playwright end-to-end demo test. | Shows engineering discipline. |
| 6 | Add admin system health page. | Makes operations look professional. |
| 7 | Add MQTT TLS diagram/config. | Strengthens IoT security story. |
| 8 | Add clinical disclaimer consistently. | Reduces medical-risk criticism. |
| 9 | Add data retention/de-identification section. | Important for patient data. |
| 10 | Add backup/recovery procedure. | Shows production thinking. |

## Final Submission Verdict

**Not ready, major fixes needed.**

Evidence: the tracked `env` file exposes real-looking production secrets; `/api/health` is public while using service-role credentials; raw MQTT is configured publicly without TLS; the start-session route contains a hardcoded MQTT password fallback; referenced documentation files are missing/stale; and I could not verify build/typecheck because `npm` and `python` are unavailable in this environment.

The project idea and architecture are strong enough to become impressive, but the security cleanup and verification evidence must happen before graduation submission.
