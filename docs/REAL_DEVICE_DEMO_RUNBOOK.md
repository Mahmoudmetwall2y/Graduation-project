# AscultiCor Real-Device Demo Runbook

This runbook is for the graduation-project presentation flow with the real ESP32 and real ECG/PCG sensors. It intentionally avoids fake device data.

## 1. Start the Local Docker Stack

Use local-safe ports and the self-signed cert paths when running on a laptop:

```bash
NGINX_HTTP_PORT=8080 \
NGINX_HTTPS_PORT=8443 \
NGINX_SSL_CERT_PATH=/etc/nginx/certs/selfsigned.crt \
NGINX_SSL_KEY_PATH=/etc/nginx/certs/selfsigned.key \
MQTT_BIND_ADDRESS=0.0.0.0 \
docker compose --env-file .env up --build -d
```

Use these URLs during local testing:

- Frontend: `http://127.0.0.1:3000`
- Inference health: `http://127.0.0.1:8000/health`
- NGINX HTTPS: `https://127.0.0.1:8443`
- MQTT TCP: `<host LAN IP>:1883`

If the ESP32 is on the same Wi-Fi network, make sure the values shown during device provisioning use the host LAN IP, not `127.0.0.1`.

Broker alignment matters: the ESP32, the start-session route, and the inference subscriber must use the same MQTT broker. For a fully local laptop demo, provision the ESP32 with `<host LAN IP>:1883`. If you intentionally provision the ESP32 to the cloud broker, start Docker with the matching command broker:

```bash
MQTT_COMMAND_BROKER_URL=mqtt://srv1621744.hstgr.cloud:1883 \
docker compose --env-file .env up -d --build frontend
```

## 2. Preflight Health Checks

Run these before the supervisor arrives:

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/metrics -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN"
docker compose --env-file .env ps
```

Expected:

- Frontend `/api/health` returns minimal `healthy`, `degraded`, or `unhealthy` status.
- Detailed frontend health checks require `/api/health?details=1` with `x-internal-token`.
- Inference reports MQTT connected and model availability.
- `ENABLE_DEMO_MODE=false`.
- Mosquitto is reachable on port `1883` from the ESP32 network.

## 3. ESP32 Hardware Checklist

1. Flash the firmware from `firmware/asculticor_esp32/AscultiCor_esp32.ino`.
2. Register the ESP32 in the AscultiCor Devices page.
3. Use the Devices page setup wizard to enter Wi-Fi details, review the QR bundle, and click `Connect ESP32 & Provision`.
4. Use the manual Serial Monitor commands only if Web Serial is unavailable in the browser.
5. Confirm the device appears `online` in the dashboard within 90 seconds.
6. Confirm telemetry appears: RSSI, firmware, uptime/free heap when available.
7. Keep Serial Monitor open during the demo to catch preflight or stream warnings.

## 4. Supervisor Demo Flow

1. Open the landing page and explain the ESP32 -> MQTT -> FastAPI -> Supabase -> Next.js path.
2. Enter the dashboard and show the readiness strip.
3. Open Devices and show the real ESP32 status and telemetry.
4. Start a 15-second session from `New Session`.
5. Confirm ECG and PCG panels show `Live sweep`.
6. Wait for processing to finish, then open the session detail page.
7. Show model outputs, model versions, latency, and advisory clinical wording.
8. Queue an LLM report from the device/session view.
9. Open Alerts and explain unresolved hardware/model workflow events if present.
10. Export the session report.

## 5. Optional n8n Workflow Check

n8n remains optional and is intended for automation visibility, not for the core real-time signal path.

Start it only when needed:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.cloud.yml up -d --build n8n
```

Manual endpoint checks:

```bash
curl -fsS -X POST "http://127.0.0.1:3000/api/n8n/workflows?action=device-health" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"

curl -fsS -X POST "http://127.0.0.1:3000/api/n8n/workflows?action=ops-monitoring" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

Imported workflows should stay inactive until each manual test passes.

## 6. Troubleshooting Signals

- `Waiting for ESP32 signal`: start command succeeded or session exists, but live frames have not reached Supabase yet.
- `Device did not acknowledge`: first verify that the command broker shown by the error matches the broker used during ESP32 provisioning.
- `Signal stale`: frames arrived previously, then stopped. Check Wi-Fi, MQTT, sensor contact, and Serial Monitor.
- Device offline: no fresh `last_seen_at` within the dashboard freshness window.
- Inference degraded: check `/api/health`, inference logs, model files, and `ENABLE_DEMO_MODE=false`.
- Report queue stuck: run the n8n `Process Pending LLM Reports` workflow or check `/api/n8n/workflows?action=ops-monitoring`.
