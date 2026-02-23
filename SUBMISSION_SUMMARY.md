## AscultiCor Submission Summary

### Overview
AscultiCor is a real-time cardiac monitoring platform combining IoT (ESP32), MQTT streaming, ML inference, and a Next.js web dashboard. It supports PCG and ECG data ingestion, live visualization, and AI-assisted classification, backed by Supabase for auth, data storage, and RLS.

### Architecture (high level)
1. Devices publish PCG/ECG chunks to MQTT.
2. Mosquitto routes messages.
3. Inference service subscribes, buffers data, runs ML, and writes results to Supabase.
4. Web dashboard shows sessions, predictions, live waveform updates, and reports.

### What Works (validated)
- Frontend lint/typecheck/build passed.
- Inference compiles with Python 3.11.
- MQTT streaming works after topic parser and auth fixes.
- Live waveform updates now render during streaming.
- Predictions appear in the UI after processing.

### Demo Mode Status
- `ENABLE_DEMO_MODE=true` (ML falls back to deterministic demo predictions if models are missing).
- `LLM_PROVIDER=demo` (template reports, no external LLM integration).

### Known Limitations
- `npm audit` shows high-severity vulnerabilities in tooling dependencies. Fixing requires `npm audit fix --force` (breaking changes). Kept stable for demo.
- Python is available via `py -3.11`, not `python` on PATH.

### Runbook (local demo)
1. Start stack:
   ```bash
   docker-compose up -d --build
   ```
2. Log in to the web app.
3. Create a device and a session in the UI.
4. Run the simulator with the full session UUID:
   ```bash
   cd simulator
   py -3.11 demo_publisher.py --broker localhost --port 1883 --username <MQTT_USERNAME> --password <MQTT_PASSWORD> --org-id <ORG_ID> --device-id <DEVICE_ID> --session-id <FULL_SESSION_UUID>
   ```
5. Observe live waveforms during streaming and predictions after completion.

### Key Files
- `README.md` – setup and quick start
- `MANUAL_STEPS.md` – external steps (keys, secrets, CORS)
- `RELEASE_CHECKLIST.md` – pre-demo/deploy checklist
- `LIVE_WAVEFORM_ENABLE.md` – live waveform setup
- `DEBUG_STEP5_NO_SESSION.md` – troubleshooting guide

