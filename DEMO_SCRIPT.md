# Demo Script (One Page)

## Setup (Before Demo)
- Start stack:
  ```bash
  docker-compose up -d --build
  ```
- Confirm app loads at `http://localhost:3000`.
- Ensure you can log in.

## Demo Flow (5–7 minutes)

### 1) Login + Dashboard (30s)
- Log in and show the main dashboard.
- Mention: multi-tenant Supabase auth + RLS.

### 2) Device Creation (45s)
- Go to Devices → Add device.
- Show the generated device credentials once.
- Mention: per-device secrets and audit log entries.

### 3) Create Session (45s)
- Go to Sessions → New Session.
- Copy the full session UUID (from URL or table).

### 4) Live Streaming (2–3 min)
- Run simulator with the session UUID:
  ```bash
  cd simulator
  py -3.11 demo_publisher.py --broker localhost --port 1883 --username <MQTT_USERNAME> --password <MQTT_PASSWORD> --org-id <ORG_ID> --device-id <DEVICE_ID> --session-id <FULL_SESSION_UUID>
  ```
- Show live ECG/PCG waveforms moving during streaming.
- Mention: MQTT → inference buffer → live metrics in Supabase.

### 5) Predictions (1 min)
- After streaming ends, show predictions on the session page.
- Mention: demo-mode ML inference when models are missing.

### 6) Report Queue (optional, 1 min)
- Trigger report generation.
- Explain: queued and processed asynchronously.

## Talking Points
- Real-time ingestion + monitoring.
- Secure multi-tenant data model (Supabase RLS).
- Live visualization + post-session predictions.
- Extensible LLM reporting pipeline (demo mode now).

## If Something Fails
- Use `DEBUG_STEP5_NO_SESSION.md` for MQTT/session issues.
- Use `LIVE_WAVEFORM_ENABLE.md` for live charts.

