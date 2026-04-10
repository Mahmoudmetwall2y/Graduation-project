# Specification: System Audit

## 1. Executive Summary

**Overall health:** Moderate to High Risk.  
The core mathematical pipeline and MQTT ingestion are robust and fully functional, but the frontend architecture introduces severe latency and scalability flaws by relying on 30-second polling rather than real-time WebSocket subscriptions. While all core dependencies (models, ML scripts, Database, UI) exist and have been Dockerized successfully, the system’s "real-time" promise is currently broken.

**Runnable end-to-end?** Yes, the system handles data ingestion to prediction to database storage cleanly. However, "real-time" dashboard visualization is delayed.

**Top critical blockers:**  
1. **Frontend Polling Architecture:** The `dashboard/page.tsx` and `devices/page.tsx` rely on `setInterval(fetchDashboardData, 30000)`. It does not utilize the configured `9001` WebSocket endpoint exposed by Mosquitto to achieve real-time telemetry.

**Overall confidence level:** 75% operational confidence regarding AI accuracy; 40% confidence regarding real-time system performance at scale.

---

## Clarifications

### Session 2026-03-25
- Q: Expected behavior if the live MQTT WebSocket connection suddenly drops? → A: Fallback temporarily to the 30-second Supabase HTTP polling until the WebSocket can reconnect.

---
## 2. Architecture Map

*   **ESP32 Edge Devices:** Publish `(1883)` -> **Mosquitto Broker**
*   **Mosquitto Broker:** 
    *   Listens on `1883` (TCP) and `9001` (WS).
    *   Authenticates via `passwd` and limits topics via `acl` file.
*   **Inference Service (Python):** 
    *   Subscribes `(1883)` -> **Mosquitto Broker** (topics: `sensors/+/ecg`, etc.)
    *   Processes `InferenceEngine` dynamically loaded from `/models`.
    *   Writes `(HTTPS)` -> **Supabase PostgreSQL**.
    *   Exposes Internal APIs (`/health`, `/config`, `/metrics`, `/simulate`) on `8000`.
*   **Frontend (Next.js):** 
    *   Reads `(HTTPS)` -> **Supabase PostgreSQL** via Next API Routes (`/api/devices`, `/api/llm`).
    *   Exposes UI on port `3000`.

**Missing pieces:** Real-time web-socket subscription missing from Frontend.

---

## 3. Connectivity Matrix

| Source Component | Destination Component | Mechanism | Endpoint/Topic | Expected Contract | Evidence Found | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Edge Devices** | **Mosquitto** | MQTT | `sensors/{device_id}/*` | Continuous signal arrays | Broker config port 1883 | **OK** |
| **Mosquitto** | **Inference** | MQTT | `sensors/+/ecg`, `pcg_*` | Clean ingestion to Engine | `mqtt_handler.py` loaded | **OK** |
| **Inference** | **Supabase** | HTTP | `supabase.table().insert()` | DB exact match schema | `supabase_client.py` usage | **OK** |
| **Frontend** | **Mosquitto** | WS | `ws://localhost:9001` | Receive live predictions | No frontend `mqtt` import | **Broken** |
| **Frontend** | **Supabase** | HTTP | Next.js API Routes | Query tables every 30s | `setInterval(..., 30000)` | **Warning** |

---

## 4. Findings

### CRITICAL

**Title:** Frontend Lacks True Real-Time WebSocket Implementation
*   **Affected Components:** Frontend (`dashboard/page.tsx`, `devices/page.tsx`)
*   **Evidence:** Files utilize `setInterval(fetchDashboardData, 30000)`, completely bypassing the Mosquitto WS port `9001` mapped in `docker-compose.yml`.
*   **Why it matters:** A 30-second delay in a cardiology dashboard is clinically dangerous and defeats the purpose of edge streaming.
*   **Exact failure mode:** UI graphs will stutter and update in massive, delayed chunks.
*   **Fix:** Implement standard `mqtt.js` or `paho-mqtt` on the React client to subscribe directly to `sensors/+/predictions` over WS `9001`.

### HIGH

**Title:** Hardcoded LLM API Key in Version Control
*   **Affected Components:** Root Configuration (`.env`)
*   **Evidence:** `OPENAI_API_KEY=sk-proj...` exposed inside the `.env` file exactly. While ignored in git, if `.env` is copied to staging improperly, it grants global access.
*   **Why it matters:** Critical financial and security vulnerability.
*   **Fix:** Rotate key immediately and inject exclusively via CI/CD secrets manager.

### MEDIUM

**Title:** Lack of Cross-Container Service Discovery in Frontend Build
*   **Affected Components:** `docker-compose.yml`, Frontend Dockerfile.
*   **Evidence:** `NEXT_PUBLIC_MQTT_WS_URL=ws://localhost:9001` hardcoded. While fine locally, this will fail if deployed to a custom domain where `localhost` targets the user's browser, not the server IP.
*   **Fix:** Ensure URL is dynamically resolved during runtime build or passed gracefully to the client layout.

---

## 5. File/Code Issues

*   **Suspicious files:** `tailwind_err.txt` (30kb compile error log lingering in frontend).
*   **Dead files:** `spec_input.txt` left in the root directory.
*   **Broken references:** `test_models.py` has missing dependencies because it was run locally on Windows instead of inside the Python container.
*   **Duplicated logic:** Identical Supabase initialization blocks in Inference `main.py` and `supabase_client.py`.

---

## 6. API Audit

*   **Route:** `/api/devices` (Next.js)
    *   **Caller:** Frontend UI
    *   **Contract Match:** Yes, correctly formats response into `Device[]`.
    *   **Validation Gap:** No explicit Zod/Joi validation on database returns.
*   **Route:** `/health` (Inference FastAPI)
    *   **Caller:** `docker-compose` healthcheck (`curl -f`)
    *   **Contract Match:** Returns `{"status": "healthy"}`. Correctly tracked by orchestration!

---

## 7. MQTT Audit

*   **Topic:** `sensors/+/ecg`
    *   **Publishers:** Hardware / `simulate` API.
    *   **Subscribers:** `Inference Engine`.
    *   **Payload mismatch risks:** Fixed. The Inference system explicitly pads `ecg` tensor inputs to `(1, 300, 2)` inside `Inference.predict_ecg()`.
*   **Topic:** `sensors/+/predictions`
    *   **Publishers:** Inference Engine.
    *   **Subscribers:** NONE! Frontend is isolated. Serious pipeline gap.

---

## 8. Deployment Audit

*   **Can it run locally?** Yes, via `start.bat`.
*   **Can it run in containers?** Yes, fully configured via `docker-compose.yml`.
*   **Required startup order:** Perfected. `inference` and `frontend` correctly utilize `depends_on: mosquitto: condition: service_healthy`.
*   **Production risk:** Supabase keys and MQTT credentials are appropriately strictly enforced via `HEALTHCHECK` requirements. However, the system lacks SSL/TLS config natively inside Mosquitto (uses `1883` unencrypted). Needs reverse proxy wrapping via Nginx.

---

## 9. Prioritized Fix Plan

1.  **Fix immediately:** Rip out `setInterval` polling in the frontend. Wire up `mqtt.js` explicitly listening to `ws://localhost:9001` for instantaneous DOM state updates matching model speeds. If the live MQTT WebSocket connection suddenly drops, the UI must temporarily fallback to the 30-second Supabase HTTP polling API until the WebSocket can reconnect securely.
2.  **Fix before staging:** Implement an NGINX layer to wrap MQTT 9001 and API 3000 under a unified `wss://` and `https://` secure certificate constraint. Rotate OpenAI keys.
3.  **Fix later:** Remove `test_models.py` and implement a unified Pytest suite executable inside the Docker isolated layer.

---

## 10. Final Verdict

**Partially operational with blockers.**

The backend pipeline (Mosquitto -> Inference Engine -> Supabase DB) is fundamentally sound, mathematically verified, and containerized perfectly. However, the exact UX flow of seeing live heartbeat waveforms is blocked entirely because the frontend developer incorrectly implemented 30-second interval HTTP database polling instead of actively subscribing to the Mosquitto WebSocket feed. Until the React layer utilizes `useMQTT`, the edge-device speed is nullified.
