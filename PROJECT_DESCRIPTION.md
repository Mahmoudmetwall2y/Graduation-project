# AscultiCor Project Description

AscultiCor is an end-to-end AI-powered cardiac monitoring platform. It combines embedded hardware, MQTT streaming, machine-learning inference, secure cloud storage, a clinical dashboard, and workflow automation into one complete system for capturing and analyzing heart sounds and ECG signals.

The project is designed around a practical clinical IoT question: can a low-cost ESP32-based device capture cardiac signals, stream them in real time, run AI analysis, and present educational clinical insights through a secure web dashboard? This repository contains the full system needed to do that, including firmware, backend services, database schema, trained model artifacts, web UI, deployment files, and automation workflows.

AscultiCor is intended for educational, research, and demonstration purposes. Its predictions and generated reports are not medical diagnoses and should always be reviewed by qualified healthcare professionals.

## Core Purpose

AscultiCor monitors two cardiac signal types:

- **PCG**, or phonocardiogram, which represents heart sounds captured through a microphone or stethoscope-style acoustic setup.
- **ECG**, or electrocardiogram, which represents electrical heart activity captured through an ECG sensor.

The platform uses an ESP32 device to capture these signals, sends them through MQTT, processes them with Python machine-learning models, stores results in Supabase, and displays everything in a Next.js dashboard.

## System Architecture

The main data flow is:

1. **ESP32 hardware captures signals**
   - ECG is captured from an AD8232 ECG module.
   - PCG is captured from a MAX9814 analog microphone.
   - ECG is sampled on-device at about 500 Hz.
   - PCG is sampled at 22,050 Hz.
   - Firmware streams data through MQTT topics.

2. **Mosquitto receives MQTT messages**
   - The broker handles device status, session metadata, heartbeat messages, and binary signal chunks.
   - Devices can use per-device MQTT credentials.
   - Broker ACLs and credentials are synchronized from Supabase.

3. **FastAPI inference service consumes MQTT**
   - The Python service subscribes to organization, device, and session topics.
   - It buffers ECG and PCG chunks per active session.
   - It reconstructs full signals when a capture ends.
   - It runs trained machine-learning models.
   - It writes recordings, predictions, live metrics, and audit logs to Supabase.

4. **Supabase stores application data**
   - PostgreSQL stores organizations, users, devices, patients, sessions, recordings, predictions, reports, live metrics, and audit logs.
   - Supabase Auth handles user authentication.
   - Row-level security isolates each organization.
   - Private Supabase Storage stores signal recordings.
   - Edge functions support device authentication and signed file URLs.

5. **Next.js frontend displays the clinical platform**
   - The dashboard shows devices, patients, sessions, waveforms, predictions, reports, alerts, and system health.
   - Users can provision ESP32 devices, start recording sessions, review AI results, and generate educational reports.

6. **n8n automates background workflows**
   - n8n workflows process queued reports, send notifications, monitor device health, generate daily digests, and support operational monitoring.

## Technology Stack

### Frontend

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Recharts
- Three.js / React Three Fiber
- Radix UI
- Supabase auth helpers
- MQTT client support
- PDF/export utilities with `html2canvas` and `jspdf`

### Backend and Inference

- Python
- FastAPI
- Uvicorn
- Pydantic
- NumPy
- SciPy
- TensorFlow / Keras
- XGBoost
- scikit-learn / joblib
- paho-mqtt
- Supabase client integration

### Infrastructure

- Docker Compose
- NGINX reverse proxy
- Mosquitto MQTT broker
- Supabase
- n8n
- ESP32 Arduino firmware

## Frontend Application

The frontend lives in `frontend/` and acts as the main clinical and administrative interface.

Important routes include:

- `/` - public landing page explaining AscultiCor, the system architecture, AI models, and demo flow.
- `/auth/login` - Supabase authentication entry point.
- `/dashboard` - admin-oriented dashboard for system health, devices, sessions, reports, live waveforms, and AI analytics.
- `/devices` - device management, device search/filtering, device health, and ESP32 provisioning.
- `/devices/[id]` - individual device detail page.
- `/patients` - patient management.
- `/sessions` - list of recording sessions.
- `/session/new` - workflow for creating a new recording session.
- `/session/[id]` - detailed session review with predictions, waveform history, model cards, and report actions.
- `/reports` - generated report listing.
- `/alerts` - clinical or operational alert view.
- `/settings` - user and organization settings.
- `/admin` and `/admin/audit` - administrative controls and audit log inspection.

The UI is designed around a medical monitoring experience. It includes signal charts, status badges, device cards, confidence indicators, model output panels, live waveform displays, patient/session workflows, and a 3D heart visualization.

## Device and Firmware Layer

The firmware is located in `firmware/asculticor_esp32/AscultiCor_esp32.ino`.

It targets an ESP32-WROOM-32 and supports:

- AD8232 ECG input on GPIO 32.
- MAX9814 PCG microphone input on GPIO 33.
- Lead-off detection using GPIO 34 and GPIO 35.
- Status LED on GPIO 2.
- Hardware timers for precise sampling.
- Double-buffered PCG capture.
- MQTT streaming.
- WiFi reconnection.
- Serial provisioning commands.
- Persistent credential storage using ESP32 NVS flash.

The recommended provisioning flow is:

1. Create a device in the web dashboard.
2. Use the device provisioning wizard.
3. Send serial commands or use browser-assisted setup.
4. The ESP32 fetches bootstrap configuration from `/api/device/bootstrap`.
5. The device receives its organization ID, MQTT host, MQTT port, MQTT username, and MQTT password.
6. The device connects and begins publishing status and session data.

Manual provisioning keys include:

- `device_id`
- `device_secret`
- `bootstrap_url`
- `wifi_ssid`
- `wifi_pass`
- `mqtt_host`
- `mqtt_port`
- `mqtt_user`
- `mqtt_pass`

## MQTT Message Flow

The inference service subscribes to topic patterns such as:

- `org/+/device/+/status`
- `org/+/device/+/session/+/meta`
- `org/+/device/+/session/+/pcg`
- `org/+/device/+/session/+/ecg`
- `org/+/device/+/session/+/heartbeat`

Session metadata messages can include:

- `start_pcg`
- `end_pcg`
- `start_ecg`
- `end_ecg`
- `preflight_ok`
- `preflight_failed`
- warning messages such as PCG overflow

Signal data is streamed as binary chunks. The inference service buffers chunks by session and modality, publishes live waveform metrics to Supabase, and runs final inference after receiving end messages or hitting configured duration limits.

## Inference Service

The inference service lives in `inference/app/`.

Important files include:

- `main.py` - FastAPI app, service lifecycle, health endpoint, config endpoint, and metrics endpoint.
- `mqtt_handler.py` - MQTT subscriptions, session buffering, signal reconstruction, live metrics publishing, timeout handling, uploads, and prediction orchestration.
- `inference.py` - model loading and prediction logic.
- `preprocessing.py` - PCG, murmur severity, and ECG preprocessing.
- `supabase_client.py` - database and storage operations.
- `security.py` - rate limiting, security headers, and related middleware.

The service exposes:

- `/` - basic service identity.
- `/health` - service health, MQTT state, Supabase/storage connectivity, model loading status, demo mode, and active sessions.
- `/config` - internal-token-protected processing configuration.
- `/metrics` - internal-token-protected active buffer and service metrics.
- `/simulate` - placeholder endpoint for simulation.

The service starts its MQTT handler during FastAPI startup. MQTT callbacks receive incoming data, while asynchronous background tasks monitor timeouts, publish live metrics, and clean up stale sessions.

## AI Models

AscultiCor includes three model families.

### Model 1: PCG XGBoost Classifier

Located in:

- `models/model1_xgboost/xgboost_model.pkl`
- `models/model1_xgboost/scaler.pkl`
- `models/model1_xgboost/label_encoder.pkl`

Purpose:

- Classifies heart sounds.
- Produces labels such as normal, murmur, artifact, or other trained classes.
- Returns probabilities, model metadata, preprocessing version, and latency.

### Model 2: CNN Murmur Severity Model

Located in:

- `models/model2_cnn_severity/best_model.keras`
- `models/model2_cnn_severity/config.json`
- `models/model2_cnn_severity/encoder_*.pkl`

Purpose:

- Runs when the PCG classifier detects a murmur.
- Produces structured murmur characteristics, including:
  - murmur location
  - systolic timing
  - systolic shape
  - systolic grading
  - systolic pitch
  - systolic quality

### Model 3: BiLSTM ECG Arrhythmia Model

Located in:

- `models/model3_bilstm_ecg/bilstm_model.keras`
- `models/model3_bilstm_ecg/label_encoder.pkl`
- `models/model3_bilstm_ecg/config.json`

Purpose:

- Classifies ECG beat windows.
- Uses a 360 Hz target sample rate and 300-sample windows.
- Maps raw beat classes into AAMI-style clinical classes:
  - Normal
  - SVEB
  - VEB
  - Fusion
  - Unknown

The inference engine supports graceful degradation. If one model fails to load, the others can still work. If no models load and demo mode is enabled, the service falls back to deterministic demo predictions.

## Signal Processing

### PCG Processing

PCG chunks are reconstructed into an audio signal, normalized, and written as WAV recordings. Features are extracted for the XGBoost classifier, and spectrogram-like inputs are prepared for the CNN severity model.

### ECG Processing

ECG chunks are reconstructed into a continuous signal. If needed, the service resamples the ESP32 capture rate to the model's expected 360 Hz. It then applies filtering, baseline correction, denoising, normalization, and windowing. Multiple windows can be analyzed and averaged. The service can also estimate heart rate from detected peak intervals.

## Supabase Database and Storage

Supabase provides authentication, PostgreSQL, row-level security, storage, and edge functions.

Core tables include:

- `organizations`
- `profiles`
- `devices`
- `device_groups`
- `device_telemetry`
- `sessions`
- `patients`
- `recordings`
- `predictions`
- `murmur_severity`
- `live_metrics`
- `llm_reports`
- `audit_logs`
- `saved_views`
- `session_notes`

Important database design choices:

- Organization-level multi-tenancy.
- Users can only access rows in their organization.
- Admins can manage organization devices and data.
- Service role writes trusted backend-generated rows such as predictions and recordings.
- Realtime table replication is intentionally avoided in the graduation-safe path.
- Dashboard freshness relies on polling to stay compatible with Supabase free-tier constraints.
- Recordings are stored in a private `recordings` bucket.
- Signed URLs provide controlled access to stored files.

## Security Model

AscultiCor includes several security layers:

- Supabase Auth for user identity.
- PostgreSQL row-level security for tenant isolation.
- Role-aware frontend and backend behavior.
- Admin-only device creation.
- Internal API tokens for operational endpoints.
- Device bootstrap secrets.
- Per-device MQTT credentials.
- MQTT password pepper.
- Trusted host middleware in the inference service.
- Configurable CORS.
- Rate limiting.
- Security headers.
- Audit logs.
- NGINX reverse proxy support.
- Private Supabase Storage.

The `.env.example` file is intentionally documented and warns against committing real credentials.

## LLM Reports

The frontend includes an asynchronous report-generation API at `/api/llm`.

The report flow is:

1. A user requests a report for a session.
2. The API validates the user, session, device, and organization.
3. A pending row is inserted into `llm_reports`.
4. A background worker or n8n workflow calls `POST /api/llm?action=process-pending`.
5. The processor atomically claims pending reports.
6. It generates a report using either demo template mode or a configured Claude provider.
7. The completed report is saved with text, structured JSON, confidence data, token estimate, and latency.

Email payload export for trusted n8n workflows is controlled by:

```env
N8N_EMAIL_PAYLOAD_EXPORT_ENABLED=false
```

This defaults to false so report/email payloads are not returned unless explicitly enabled for a trusted workflow.

## n8n Automation

The `n8n/` folder contains importable workflow exports:

- `00-connectivity-check`
- `01-process-pending-llm-reports`
- `02-clinical-alert-notifications`
- `03-device-health-monitoring`
- `04-daily-digest`
- `05-recording-summary-enrichment`
- `06-ops-monitoring`
- `07-alert-escalation`

These workflows support report processing, clinical alerts, operational checks, device health monitoring, daily summaries, and escalation flows.

## Deployment

The project supports Docker Compose deployment.

Main services:

- `frontend`
- `inference`
- `mosquitto`
- `nginx`

Optional cloud automation uses n8n through `docker-compose.cloud.yml`.

Typical local service URLs:

- Frontend: `http://localhost:3000`
- Inference API: `http://localhost:8000`
- MQTT TCP: `mqtt://localhost:1883`
- MQTT WebSocket: `ws://localhost:9001`

The repository also contains documentation for:

- cloud deployment
- cloud VM deployment
- Hostinger VPS deployment
- AWS migration
- real-device demo runbook
- hardware integration
- Supabase setup
- device management

## Environment Configuration

The `.env.example` file covers:

- Supabase URL and keys.
- MQTT credentials and bind addresses.
- Device bootstrap settings.
- Frontend, inference, and NGINX ports.
- ML sample rates and duration limits.
- Demo mode.
- Logging.
- Internal API tokens.
- CORS and trusted hosts.
- Rate limiting.
- Security headers.
- LLM provider settings.
- n8n settings.
- Edge function CORS.

Important defaults include:

- `ENABLE_DEMO_MODE=false`
- `LLM_PROVIDER=demo`
- `MQTT_BIND_ADDRESS=127.0.0.1`
- `N8N_EMAIL_PAYLOAD_EXPORT_ENABLED=false`

For real ESP32 devices on a LAN, `MQTT_BIND_ADDRESS` usually needs to be changed to `0.0.0.0` so hardware can reach the broker.

## Training Assets

The `training/` folder contains scripts for model development:

- XGBoost heart sound classification.
- CNN murmur severity.
- BiLSTM ECG arrhythmia.
- Alternative CNN ECG experiments.
- Kaggle-oriented ECG training.
- Colab training guide.
- Training logs and Python requirements.

The trained model artifacts are included under `models/`.

## What Makes AscultiCor Complete

AscultiCor is not only a dashboard or a model demo. It is a complete system that includes:

- Physical device firmware.
- Sensor acquisition.
- MQTT telemetry.
- Secure device provisioning.
- Backend streaming ingestion.
- Real-time metrics.
- Signal recording storage.
- Three-model AI pipeline.
- Multi-tenant clinical data model.
- Authentication and authorization.
- Patient, session, report, and device management.
- LLM-assisted educational reports.
- n8n workflow automation.
- Dockerized deployment.
- Cloud and VPS documentation.
- Real-device demo support.

In short, AscultiCor is a full-stack medical IoT and AI platform for cardiac auscultation and ECG monitoring. It is structured as a graduation project, but its repository contains the layers expected from a realistic production-style prototype: embedded capture, secure streaming, model inference, database isolation, administrative workflows, and a polished operator interface.
