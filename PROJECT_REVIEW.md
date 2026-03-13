# AscultiCor — Full Project Review

## Overview
A cardiac monitoring system using IoT (ESP32), MQTT, Python ML inference, Next.js frontend, and Supabase as the database/auth layer. Well-architected overall, but with significant issues worth addressing before production.

---

## 🔴 Critical Issues

### 1. Inference Service Port 8000 Exposed Publicly
**File:** `docker-compose.yml` line 34
```yaml
ports:
  - "8000:8000"  # ← Exposed on all interfaces
```
The inference FastAPI service is publicly accessible. Internal endpoints (`/config`, `/metrics`, `/simulate`) are token-protected, but `/health`, `/docs`, `/redoc`, and `/` are not. An attacker can probe your ML pipeline, discover your architecture, and spam the health endpoint.

**Fix:** Remove the `ports` block from `inference` entirely (it only needs internal docker network access), or bind to `127.0.0.1:8000:8000`.

---

### 2. MQTT Broker Port 1883 Exposed (Unencrypted)
**File:** `docker-compose.yml` lines 8-10
```yaml
ports:
  - "1883:1883"   # Unencrypted MQTT
  - "9001:9001"   # Unencrypted WebSocket
```
Anyone on the network can connect to your Mosquitto broker and publish fake session data, poisoning real readings or triggering bogus ML inference runs. No TLS is configured.

**Fix:** Use port `8883` with TLS certs for MQTT in production. Bind ports to `127.0.0.1` if only needed locally.

---

### 3. No MQTT Auto-Reconnect Logic
**File:** `inference/app/mqtt_handler.py` lines 288-291
```python
def _on_disconnect(self, client, userdata, rc):
    if rc != 0:
        logger.warning(f"Unexpected MQTT disconnection (code {rc})")
```
If the MQTT broker disconnects unexpectedly, the inference service just logs it and stops receiving data — **permanently** until restarted. No reconnection is attempted.

**Fix:** Add `self.client.reconnect_delay_set(min_delay=1, max_delay=120)` and call `self.client.reconnect()` (with exponential backoff) in `_on_disconnect`.

---

### 4. LLM Is Demo-Only — No Real Provider Integrated
**File:** `frontend/src/app/api/llm/route.ts` lines 476-478
```ts
if (llmProvider !== 'demo') {
  throw new Error(`LLM_PROVIDER=${llmProvider} is not implemented.`)
}
```
The entire LLM report generation is template-based. Setting `LLM_PROVIDER` to anything other than `demo` crashes. There's no OpenAI / Anthropic / Gemini integration.

**Fix:** Implement at least one real LLM provider (e.g., Google Gemini via `@google/generative-ai`) behind the `LLM_PROVIDER` env var check.

---

### 5. No LLM Report Processing Trigger (No Cron/Background Worker)
**File:** `frontend/src/app/api/llm/route.ts` line 66
```ts
// action=process-pending: process pending reports (internal/cron use only)
```
Reports are queued into `llm_reports` table as `pending`, but **nothing calls `POST /api/llm?action=process-pending`** automatically. Reports will accumulate as pending forever unless manually triggered.

**Fix:** Set up a cron job (Supabase Edge Function scheduled trigger, Vercel cron, or a background task in the inference service) to call the processing endpoint periodically.

---

## 🟡 Significant Issues

### 6. Middleware Doesn't Protect the Root `/` Route
**File:** `frontend/src/middleware.ts` lines 18-21
```ts
if (session && req.nextUrl.pathname.startsWith('/auth')) {
  return NextResponse.redirect(new URL('/', req.url))
}
```
The middleware redirects authenticated users away from `/auth` to `/`, but the landing page `/` itself is **not protected** — anyone unauthenticated can view it. This is likely intentional for the marketing page, but worth confirming. The redirect target for authenticated `/auth` pages should probably be `/dashboard` instead of `/`.

---

### 7. Session "Done" State — Race Condition Between PCG and ECG
**File:** `inference/app/mqtt_handler.py` lines 566-576 & 677-688
Both `_handle_end_pcg` and `_handle_end_ecg` independently check if the **other** modality's buffer is still active to decide when to mark the session `done`. This creates a potential race condition: if both end simultaneously, both could decide the other is absent and both try to mark the session `done`.

**Fix:** Use a database-level `UPDATE ... WHERE status = 'processing'` atomic compare-and-set, or use a semaphore/lock per session.

---

### 8. `SessionBuffer` Memory Growth Unbounded
**File:** `inference/app/mqtt_handler.py` lines 55-56
```python
self.chunks = []     # Grows indefinitely until session ends
self.total_bytes = 0
```
All chunks are held in memory until the session ends. For a PCG recording at 22,050 Hz × 16-bit = ~44 KB/second, a 15-second session = ~660 KB. Generally fine, but there's no cap on `total_bytes` before `_force_end_session` kicks in for the "exceeds max duration" check.

---

### 9. `processPendingReports` Has No Concurrency Limit
**File:** `frontend/src/app/api/llm/route.ts` lines 262-317
All `readyReports` (up to 20) are processed in a sequential loop. If each takes 5s (for a real LLM call), 20 reports = 100s timeout. The route would time out on Vercel/Next.js (default 10s for API routes).

**Fix:** Either process reports with a real background job, use streaming responses, or limit to 1-3 per invocation.

---

### 10. `patient_id` Missing from Sessions Table
**File:** `supabase/migrations/001_initial_schema.sql` vs `frontend/src/app/sessions/page.tsx` line 27
The sessions page queries `patient_id` on sessions, but the initial schema has no `patient_id` column on the sessions table. It was likely added in a later migration, but the column isn't indexed which could slow queries.

---

### 11. `Patients` Page Allows Deletion Without Cascading Session Check
**File:** `supabase/migrations/023_delete_policies...sql`
Deletion of patients is allowed for admins, but sessions referencing `patient_id` may become orphaned (if patient deletion doesn't cascade). This depends on whether `ON DELETE SET NULL` or `ON DELETE CASCADE` is configured, which needs verification.

---

## 🟢 Suggestions & Minor Improvements

### 12. Inference Docs Exposed in All Environments
**File:** `inference/app/main.py` line 85-86
```python
docs_url="/docs" if os.getenv("ENABLE_DOCS", "true").lower() == "true" else None,
```
The default is `true`, so `/docs` and `/redoc` are accessible in production unless explicitly disabled.

**Fix:** Default to `false` and only enable in dev: `os.getenv("ENABLE_DOCS", "false")`.

---

### 13. No Health Check Startup Period for Inference
**File:** `docker-compose.yml` lines 75-79
The inference healthcheck has no `start_period`, meaning docker may report it as unhealthy during model loading (which can take 5-30s for TF models).

**Fix:** Add `start_period: 30s` to the inference healthcheck.

---

### 14. Frontend Depends on Inference, Not Just Mosquitto
**File:** `docker-compose.yml` line 101
```yaml
depends_on:
  - inference
```
The frontend doesn't truly need the inference service to start — it connects directly to Supabase. This dependency just slows startup.

---

### 15. No Input Sanitization on `device_id` / `session_id` in LLM Route
**File:** `frontend/src/app/api/llm/route.ts` lines 81-88
```ts
const { session_id, device_id } = await request.json()
if (!session_id || !device_id) { ... }
```
There's no UUID format validation, so someone could pass very long strings or special chars. Supabase will reject invalid UUIDs, but adding a quick regex check would return a cleaner error.

---

### 16. `globals.css` Is 28 KB
**File:** `frontend/src/app/globals.css`
At 28 KB, the global stylesheet is quite large. This likely includes legacy styles from previous redesign iterations. A CSS audit/cleanup would reduce bundle size.

---

### 17. No Test Coverage for Inference
**File:** `inference/tests/`
Only basic tests exist. The MQTT message routing, inference pipeline, and Supabase write paths have no automated tests. Adding integration tests with mock MQTT + mock Supabase would significantly improve reliability.

---

## Summary Table

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | 🔴 Critical | Infrastructure | Inference port exposed publicly |
| 2 | 🔴 Critical | Security | MQTT unencrypted + public |
| 3 | 🔴 Critical | Reliability | No MQTT reconnect logic |
| 4 | 🔴 Critical | Feature Gap | LLM is demo-only |
| 5 | 🔴 Critical | Feature Gap | No cron to process LLM queue |
| 6 | 🟡 Medium | Auth | Middleware redirects to `/` not `/dashboard` |
| 7 | 🟡 Medium | Concurrency | Session done race condition |
| 8 | 🟡 Medium | Memory | Unbounded buffer growth |
| 9 | 🟡 Medium | Performance | LLM batch has no duration cap |
| 10 | 🟡 Medium | DB | `patient_id` not indexed on sessions |
| 11 | 🟡 Medium | DB Integrity | Patient deletion cascade unclear |
| 12 | 🟢 Minor | Security | Docs exposed by default in prod |
| 13 | 🟢 Minor | DevOps | No inference healthcheck `start_period` |
| 14 | 🟢 Minor | DevOps | Unnecessary frontend→inference dependency |
| 15 | 🟢 Minor | Validation | No UUID format validation in LLM route |
| 16 | 🟢 Minor | Performance | 28 KB global CSS needs cleanup |
| 17 | 🟢 Minor | Quality | No inference service test coverage |
