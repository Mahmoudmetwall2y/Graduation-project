Act as a senior full-stack IoT/AI systems architect, embedded systems reviewer, backend/API auditor, DevOps reviewer, cybersecurity reviewer, medical-AI safety reviewer, and graduation-project examiner.

I need you to perform a complete professional audit of my graduation project repository.

Project name: AscultiCor

AscultiCor is an end-to-end AI-powered cardiac monitoring platform. It combines embedded hardware, real-time MQTT streaming, machine-learning inference, secure cloud storage, a clinical dashboard, and workflow automation into one complete system for capturing and analyzing heart sounds and ECG signals.

The project is intended for educational, research, and demonstration purposes only. Its predictions, reports, and model outputs must not be presented as medical diagnoses.

Critical context you must use during the audit:

1. The project is currently local during development.
2. The target deployment is a Hostinger VPS.
3. The project must be reviewed as a local-to-Hostinger-VPS migration project.
4. The main workflow is not based on prepared demo data.
5. The primary intended workflow is real-time acquisition from actual hardware sensors.
6. The ESP32 is connected to physical sensors:
   - AD8232 ECG sensor for real ECG capture.
   - MAX9814 analog microphone for PCG / heart-sound capture.
7. The ESP32 should publish real ECG and PCG data through MQTT.
8. The inference service should consume live sensor streams, reconstruct signals, run inference, store results, and display them in the dashboard.
9. Demo mode, mock data, deterministic fallback predictions, or template reports must be clearly separated from real hardware mode.
10. Do not assume demo data exists unless you verify it in the repository.
11. Do not assume real hardware flow works unless you verify the firmware, MQTT topics, backend subscriber, database writes, and frontend display path.

Core project stack:

- ESP32-WROOM-32 firmware
- AD8232 ECG module
- MAX9814 analog microphone
- Mosquitto MQTT broker
- FastAPI inference service
- Python ML inference pipeline
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase Row-Level Security
- Supabase Edge Functions, if present
- Next.js 14 frontend
- React 18
- TypeScript
- Tailwind CSS
- Recharts
- Three.js / React Three Fiber
- Radix UI
- n8n automation workflows
- Docker Compose
- NGINX reverse proxy
- Hostinger VPS deployment target
- AI models for PCG classification, murmur severity, and ECG arrhythmia classification

Expected system data flow:

1. AD8232 ECG sensor captures ECG signal.
2. MAX9814 microphone captures PCG / heart-sound signal.
3. ESP32 samples ECG and PCG.
4. ESP32 publishes binary signal chunks and metadata to MQTT.
5. Mosquitto receives device status, session metadata, heartbeat messages, and ECG/PCG chunks.
6. FastAPI inference service subscribes to MQTT.
7. Inference service buffers chunks by organization, device, session, and modality.
8. Inference service reconstructs full ECG and PCG signals.
9. Inference service preprocesses signals.
10. AI models generate predictions.
11. Recordings, predictions, metrics, reports, and audit logs are written to Supabase.
12. Next.js dashboard displays devices, patients, sessions, live waveforms, predictions, reports, alerts, and system health.
13. n8n workflows process reports, alerts, daily digests, health checks, and operational workflows.

Expected hardware details:

- ESP32-WROOM-32
- AD8232 ECG input on GPIO 32
- MAX9814 PCG microphone input on GPIO 33
- Lead-off detection on GPIO 34 and GPIO 35
- Status LED on GPIO 2
- Hardware timers for precise sampling
- ECG sampling around 500 Hz
- PCG sampling around 22,050 Hz
- Double-buffered PCG capture
- MQTT streaming
- WiFi reconnection
- Serial provisioning commands
- Persistent credential storage using ESP32 NVS flash

Expected firmware file:

- firmware/asculticor_esp32/AscultiCor_esp32.ino

Expected provisioning flow:

1. Create a device in the dashboard.
2. Use the device provisioning wizard.
3. Send serial commands or use browser-assisted setup.
4. ESP32 fetches bootstrap configuration from /api/device/bootstrap.
5. Device receives organization ID, MQTT host, MQTT port, MQTT username, and MQTT password.
6. Device connects to MQTT.
7. Device publishes status, heartbeat, session metadata, ECG chunks, and PCG chunks.

Manual provisioning keys may include:

- device_id
- device_secret
- bootstrap_url
- wifi_ssid
- wifi_pass
- mqtt_host
- mqtt_port
- mqtt_user
- mqtt_pass

Expected MQTT topic patterns:

- org/+/device/+/status
- org/+/device/+/session/+/meta
- org/+/device/+/session/+/pcg
- org/+/device/+/session/+/ecg
- org/+/device/+/session/+/heartbeat

Expected session metadata message types:

- start_pcg
- end_pcg
- start_ecg
- end_ecg
- preflight_ok
- preflight_failed
- warning messages such as PCG overflow

Expected frontend routes:

- /
- /auth/login
- /dashboard
- /devices
- /devices/[id]
- /patients
- /sessions
- /session/new
- /session/[id]
- /reports
- /alerts
- /settings
- /admin
- /admin/audit

Expected Next.js API routes:

- /api/device/bootstrap
- /api/llm
- POST /api/llm?action=process-pending

Expected inference service files:

- inference/app/main.py
- inference/app/mqtt_handler.py
- inference/app/inference.py
- inference/app/preprocessing.py
- inference/app/supabase_client.py
- inference/app/security.py

Expected FastAPI endpoints:

- /
- /health
- /config
- /metrics
- /simulate

Expected AI model artifacts:

- models/model1_xgboost/xgboost_model.pkl
- models/model1_xgboost/scaler.pkl
- models/model1_xgboost/label_encoder.pkl
- models/model2_cnn_severity/best_model.keras
- models/model2_cnn_severity/config.json
- models/model2_cnn_severity/encoder_*.pkl
- models/model3_bilstm_ecg/bilstm_model.keras
- models/model3_bilstm_ecg/label_encoder.pkl
- models/model3_bilstm_ecg/config.json

Expected Supabase tables:

- organizations
- profiles
- devices
- device_groups
- device_telemetry
- sessions
- patients
- recordings
- predictions
- murmur_severity
- live_metrics
- llm_reports
- audit_logs
- saved_views
- session_notes

Expected local development URLs:

- Frontend: http://localhost:3000
- Inference API: http://localhost:8000
- MQTT TCP: mqtt://localhost:1883
- MQTT WebSocket: ws://localhost:9001

Expected environment defaults:

- ENABLE_DEMO_MODE=false
- LLM_PROVIDER=demo
- MQTT_BIND_ADDRESS=127.0.0.1
- N8N_EMAIL_PAYLOAD_EXPORT_ENABLED=false

Important deployment context:

The project is currently local, but the target deployment is a Hostinger VPS.

Review both deployment modes separately:

A. Local development mode

- Frontend may run on localhost:3000.
- Inference may run on localhost:8000.
- MQTT TCP may run on localhost:1883.
- MQTT WebSocket may run on localhost:9001.
- ESP32 cannot use its own localhost to reach the developer machine.
- ESP32 usually needs the host machine LAN IP during local testing.
- Docker service names may work inside Docker but not from browser or ESP32.
- Hardcoded localhost values must be classified according to whether they are browser-only, server-only, Docker-internal, or ESP32-facing.

B. Hostinger VPS deployment mode

- Public domain or VPS IP should replace localhost for external clients.
- NGINX should reverse-proxy frontend and backend correctly.
- MQTT TCP and/or MQTT WebSocket exposure must be reviewed explicitly.
- Hostinger firewall rules must allow required ports.
- Docker container ports must be mapped correctly.
- Mosquitto must bind to the correct interface.
- TLS/SSL should be configured for dashboard and APIs.
- Secure MQTT or secure WebSocket should be considered.
- Environment variables must distinguish local URLs from VPS/public URLs.
- ESP32 bootstrap_url and mqtt_host must be reachable from the ESP32 network.
- Supabase callback URLs, CORS, redirect URLs, and trusted hosts must include the deployed domain.
- n8n webhook URLs and internal API URLs must not remain localhost-only.
- Any hardcoded localhost value must be flagged if it breaks VPS deployment.

Important real-data context:

The project currently does not rely on prepared demo data as the main workflow. The intended primary workflow is real-time acquisition from physical hardware sensors.

You must evaluate the system as a real-time hardware-connected platform, not a static mock dashboard.

You must verify:

1. Whether any seeded demo data exists.
2. Whether the dashboard depends on demo/mock data.
3. Whether the inference service can operate with ENABLE_DEMO_MODE=false.
4. Whether the firmware actually publishes real ECG and PCG chunks.
5. Whether firmware MQTT topics match inference subscriptions.
6. Whether frontend displays real data from Supabase and/or MQTT.
7. Whether demo mode is clearly separated from real hardware mode.
8. Whether ENABLE_DEMO_MODE=false is respected everywhere.
9. Whether missing hardware data causes graceful errors instead of fake predictions.
10. Whether reports and predictions are clearly based on real sensor input when demo mode is disabled.

If demo/mock/sample data is found, classify it as:

- required for operation
- optional fallback
- testing-only
- unsafe hidden demo behavior
- unused/dead code

Evidence rule:

Do not guess. Every issue, endpoint, route, model behavior, environment variable, file path, security problem, or architectural claim must be based on actual repository evidence.

For every finding, cite:

- file path
- function/component/class/route/table name where possible
- relevant config key, environment variable, SQL policy, MQTT topic, or code block
- whether the finding is verified, partially verified, not found, or insufficient data to verify

Use these labels exactly:

- Verified
- Partially verified
- Not found
- Insufficient data to verify
- Risk
- Recommendation

If something cannot be verified from the repository, write:

“Insufficient data to verify.”

Do not fill missing information with assumptions.

Start by scanning the repository tree, then proceed layer by layer.

If the repository is too large to fully inspect, state:

- exactly which files were inspected
- exactly which files were not inspected
- why they were not inspected
- what risks remain because of that limitation

────────────────────────────────
1. Repository structure audit
────────────────────────────────

Inspect the entire repository tree.

Create a clear map of:

- frontend/
- inference/
- firmware/
- models/
- training/
- supabase/
- n8n/
- docker/deployment files
- NGINX config
- Mosquitto config
- documentation files
- environment examples
- scripts
- tests
- CI/CD files, if any

For each major folder, report:

- purpose
- key files
- whether it matches the project description
- missing files
- unexpected gaps
- duplicated files
- conflicting files
- dead code
- unused files
- placeholder-only files
- misleading files
- files that are present but disconnected from the actual system

Output format:

Table:
- Area
- Expected
- Found
- Status
- Evidence
- Risk
- Recommendation

Allowed statuses:

- OK
- PARTIAL
- MISSING
- INCONSISTENT
- NEEDS MANUAL TEST

────────────────────────────────
2. Frontend route and page audit
────────────────────────────────

Inspect the Next.js application.

Identify:

- all App Router routes
- all Pages Router routes, if present
- all API routes
- dynamic routes
- public routes
- protected routes
- admin-only routes
- pages/components depending on Supabase
- pages/components depending on MQTT
- pages/components calling the inference service
- pages/components calling /api/llm
- pages/components handling device provisioning
- pages/components displaying live waveforms
- pages/components displaying predictions
- pages/components displaying reports
- pages/components displaying alerts
- pages/components displaying system health

Compare actual routes against expected frontend routes:

- /
- /auth/login
- /dashboard
- /devices
- /devices/[id]
- /patients
- /sessions
- /session/new
- /session/[id]
- /reports
- /alerts
- /settings
- /admin
- /admin/audit

For each route, report:

- exists or missing
- exact file path
- purpose
- data sources
- API calls used
- Supabase queries used
- auth checks
- authorization checks
- organization/tenant checks
- loading states
- error states
- empty states
- whether real data is used
- whether mock/demo data is used
- whether it is production-polished or demo-only
- broken imports
- missing components
- inconsistent naming
- localhost or local-only assumptions
- VPS deployment risks
- examiner/demo-day risks

Output:

- Frontend Route Inventory
- Frontend Data Source Map
- Protected Route Matrix
- Broken/Missing Route Report
- Mock/Demo Data Usage Report
- Route-to-Feature Coverage Matrix
- Priority Fix List

────────────────────────────────
3. Next.js API route audit
────────────────────────────────

Inspect all Next.js API routes.

Specially verify:

- /api/device/bootstrap
- /api/llm
- POST /api/llm?action=process-pending

For every API route, report:

- method support: GET, POST, PUT, PATCH, DELETE
- path
- source file
- purpose
- request query parameters
- request body schema
- response shape
- auth checks
- role checks
- tenant/org checks
- device-secret checks
- service-role usage
- validation
- rate limiting
- error handling
- audit logging
- whether frontend calls it
- whether firmware calls it
- whether n8n calls it
- whether it is unused
- whether it uses localhost
- whether it is safe for Hostinger VPS deployment

For /api/device/bootstrap, specifically verify:

- how device_id is received
- how device_secret is received
- how device_secret is validated
- whether secrets are hashed or stored plaintext
- whether bootstrap can leak MQTT credentials
- whether organization ID is returned safely
- whether MQTT host/port returned are valid for local and VPS deployment
- whether response shape matches firmware parser
- whether errors are firmware-friendly
- whether repeated bootstrap attempts are rate-limited
- whether audit logs are written

For /api/llm, specifically verify:

- user/session authorization
- organization isolation
- pending report insertion
- atomic claim behavior for process-pending
- demo template mode
- Claude provider mode
- token/latency tracking
- report safety wording
- N8N_EMAIL_PAYLOAD_EXPORT_ENABLED behavior
- whether email payload export is disabled by default
- whether n8n can process reports securely

Output:

- Next.js API Route Inventory
- API Security Matrix
- Device Bootstrap Review
- LLM Report API Review
- Unused or Broken API Routes
- Required Fixes

────────────────────────────────
4. Backend/FastAPI endpoint audit
────────────────────────────────

Inspect the inference service.

Find:

- all FastAPI routes
- routers
- dependencies
- startup hooks
- shutdown hooks
- middleware
- background tasks
- MQTT startup logic
- model loading logic
- Supabase client initialization
- storage client initialization
- health checks

Verify expected endpoints:

- /
- /health
- /config
- /metrics
- /simulate

For each endpoint, report:

- method
- path
- source file
- purpose
- request parameters/body
- response shape
- auth/internal-token protection
- error handling
- whether it matches documentation
- whether it is reachable through Docker
- whether it is reachable through NGINX
- whether frontend uses it
- whether n8n uses it
- whether it exposes sensitive data
- whether it is safe for Hostinger VPS
- whether it depends on localhost

Specifically review:

- CORS configuration
- trusted-host middleware
- security headers
- rate limiting
- internal-token validation
- lifecycle startup of MQTT handler
- graceful shutdown
- model loading behavior
- Supabase connectivity checks
- storage connectivity checks
- demo mode fallback
- active session metrics
- error logging
- readiness vs liveness distinction
- whether health endpoint leaks secrets or internal details

Output:

- FastAPI Endpoint Inventory
- Endpoint Security Matrix
- Health/Readiness Review
- Backend Issues by Severity
- Recommended Endpoint Improvements

────────────────────────────────
5. MQTT and streaming audit
────────────────────────────────

Inspect:

- Mosquitto configuration
- MQTT ACL files
- MQTT password files or generation scripts
- MQTT client code in inference service
- MQTT code in firmware
- frontend MQTT client usage, if present
- Docker Compose MQTT port mapping
- NGINX MQTT WebSocket routing, if present
- Supabase credential synchronization, if implemented

Verify:

- topic naming consistency between firmware and inference
- topic naming consistency with documentation
- topic naming consistency with frontend expectations
- topic naming consistency with Mosquitto ACLs
- org/device/session identifiers in topics
- status messages
- heartbeat messages
- session metadata messages
- PCG binary chunk publishing
- ECG binary chunk publishing
- QoS levels
- retained messages
- reconnect behavior
- duplicate message handling
- out-of-order chunk handling
- chunk sequence numbers
- chunk timestamps
- session timeout handling
- malformed message handling
- maximum payload size
- broker auth
- ACL enforcement
- per-device credentials
- Supabase credential synchronization
- MQTT WebSocket support
- Docker/network exposure
- LAN hardware exposure
- Hostinger VPS exposure
- firewall/port requirements
- TLS or secure WebSocket options

Create a full MQTT contract table:

- Topic
- Publisher
- Subscriber
- Payload type
- Payload schema
- QoS
- Retain
- Frequency
- Failure modes
- Code evidence

Identify any mismatch between:

- firmware topic strings
- inference subscription patterns
- frontend MQTT client expectations
- Mosquitto ACLs
- documentation
- local environment variables
- VPS environment variables

Output:

- MQTT Contract
- MQTT Mismatch Report
- Streaming Reliability Risks
- Broker Security Review
- MQTT Local vs VPS Deployment Review
- Recommended MQTT Refactor

────────────────────────────────
6. Real hardware data vs demo data audit
────────────────────────────────

Produce a dedicated section titled:

“Real Hardware Data vs Demo Data Audit”

Verify:

- whether seeded demo data exists
- where demo/mock data is located
- whether frontend uses mock data
- whether inference uses deterministic demo predictions
- whether demo mode can accidentally be enabled in production/VPS
- whether ENABLE_DEMO_MODE=false is respected
- whether LLM_PROVIDER=demo affects only reports or also clinical predictions
- whether missing hardware data causes fake predictions
- whether real ESP32-to-MQTT-to-inference path is complete
- whether real-device demo works without seeded data
- whether the dashboard clearly distinguishes real data from demo/sample data
- whether reports identify if they are generated from real sensor input or demo/template mode
- whether any charts, cards, statistics, or model panels show fake values

Classify any demo/mock/sample data found as:

- required for operation
- optional fallback
- testing-only
- unsafe hidden demo behavior
- unused/dead code

Output:

- Demo/Mock Data Inventory
- Real-Data Path Verification
- Hidden Demo Behavior Risks
- Files Requiring Modification
- Recommendations to Make Real-Data Mode Explicit

────────────────────────────────
7. Hardware/software integration review
────────────────────────────────

This is one of the most important sections.

Review the complete real-time hardware path:

AD8232 ECG sensor
→ ESP32 ADC sampling
→ ECG binary MQTT chunks
→ Mosquitto broker
→ FastAPI MQTT subscriber
→ ECG signal reconstruction
→ ECG preprocessing/resampling
→ ECG model inference
→ Supabase storage
→ dashboard waveform/prediction display

MAX9814 PCG microphone
→ ESP32 ADC sampling
→ PCG binary MQTT chunks
→ Mosquitto broker
→ FastAPI MQTT subscriber
→ PCG signal reconstruction
→ WAV/storage/preprocessing
→ PCG classifier
→ murmur severity model, if applicable
→ Supabase storage
→ dashboard waveform/prediction/report display

Review the connection between:

- ESP32 firmware
- WiFi provisioning
- serial provisioning
- device bootstrap API
- MQTT broker
- inference MQTT subscriber
- Supabase devices table
- frontend provisioning wizard
- real-device demo workflow
- environment variables
- Docker networking
- LAN IP vs localhost usage
- Hostinger VPS public IP/domain
- firewall rules
- NGINX routes
- TLS/SSL
- MQTT TCP/WebSocket access

Find every place where hardware setup may confuse a student, examiner, or user.

Specifically check:

- whether device_id lifecycle is clear
- whether device_secret lifecycle is clear
- whether bootstrap_url is realistic for ESP32
- whether MQTT host is reachable from ESP32 locally
- whether MQTT host is reachable from ESP32 on Hostinger VPS
- whether MQTT_BIND_ADDRESS=127.0.0.1 blocks real hardware
- whether localhost is incorrectly used for real-device flow
- whether dashboard displays LAN IP instructions
- whether dashboard displays VPS/domain instructions
- whether serial provisioning commands are documented
- whether serial provisioning commands are robust
- whether WiFi credentials are handled safely
- whether device credentials are stored securely in NVS
- whether firmware can recover from failed provisioning
- whether firmware can reset provisioning
- whether firmware can reconnect after WiFi loss
- whether firmware can reconnect after MQTT loss
- whether firmware publishes clear error/status states
- whether start/stop session commands are clear
- whether ECG and PCG capture can be tested independently
- whether a preflight test exists before recording
- whether lead-off detection is surfaced to UI
- whether PCG overflow warnings are surfaced to UI
- whether sample rates are consistent across firmware, inference, and model configs
- whether ECG 500 Hz to 360 Hz resampling is implemented correctly
- whether PCG 22,050 Hz is consistently handled
- whether binary data format is documented enough
- whether endian/sign/ADC scaling is consistent
- whether ADC calibration is handled or documented
- whether signal quality indicators exist
- whether there is a simulator for hardware-free testing without pretending to be real data
- whether demo-day workflow can be executed reliably

Produce a “Hardware-to-Software Simplification Plan” with:

- current friction points
- exact root causes
- recommended changes
- file paths to modify
- proposed dashboard UX copy
- proposed serial command format
- proposed diagnostic checklist
- proposed preflight API/status design
- proposed real-device demo runbook
- proposed local testing flow
- proposed Hostinger VPS testing flow

The goal is to make the hardware/software connection easier, clearer, more reliable, and more professional.

────────────────────────────────
8. Supabase database, storage, security, and RLS audit
────────────────────────────────

Inspect:

- Supabase migrations
- SQL files
- seed files, if any
- Edge Functions
- storage policies
- database client usage
- service-role usage
- frontend Supabase client usage
- backend Supabase client usage
- n8n Supabase access, if present

Verify:

- table definitions
- foreign keys
- indexes
- constraints
- RLS enabled where needed
- organization isolation
- user role model
- admin-only device creation
- service-role-only writes
- patient/session ownership
- recordings bucket privacy
- signed URL generation
- audit_logs usage
- devices table fields needed by firmware/provisioning
- llm_reports queue behavior
- live_metrics cleanup strategy
- tenant leakage risks
- dangerous client-side service role usage
- exposed secrets
- unsafe environment variables
- missing validation in Edge Functions
- device bootstrap secret verification
- MQTT credential storage
- MQTT password hashing/peppering
- storage bucket public/private status
- whether Supabase redirect/CORS URLs support Hostinger VPS
- whether local URLs remain in production config

Output:

- Database Schema Inventory
- RLS Policy Matrix
- Storage Policy Review
- Supabase Client Usage Review
- Device Credential Security Review
- Critical Security Findings
- Recommended Migration/Policy Fixes

────────────────────────────────
9. AI inference and signal-processing audit
────────────────────────────────

Inspect:

- model loading
- preprocessing
- inference orchestration
- PCG processing
- murmur severity model invocation
- ECG processing
- ECG resampling
- ECG windowing
- normalization
- filtering
- denoising
- heart-rate estimation
- error handling
- latency logging
- prediction persistence
- demo-mode fallback
- model metadata reporting

Verify model artifact paths:

- models/model1_xgboost/xgboost_model.pkl
- models/model1_xgboost/scaler.pkl
- models/model1_xgboost/label_encoder.pkl
- models/model2_cnn_severity/best_model.keras
- models/model2_cnn_severity/config.json
- models/model2_cnn_severity/encoder_*.pkl
- models/model3_bilstm_ecg/bilstm_model.keras
- models/model3_bilstm_ecg/label_encoder.pkl
- models/model3_bilstm_ecg/config.json

Check:

- whether model artifacts exist
- whether model load paths work locally
- whether model load paths work from Docker
- whether model load paths work on Hostinger VPS
- whether failures degrade gracefully
- whether predictions include probabilities/confidence
- whether murmur severity only runs when appropriate
- whether ECG classes map to Normal/SVEB/VEB/Fusion/Unknown
- whether sample rates match model expectations
- whether preprocessing is deterministic
- whether clinical wording avoids diagnosis claims
- whether reports are educational and safe
- whether demo fallback is impossible when demo mode is disabled
- whether model output is traceable to real recordings
- whether predictions can be regenerated or audited
- whether corrupted/short/noisy signals are handled safely

Output:

- Model Inventory
- Signal Pipeline Map
- Sample Rate Consistency Report
- Inference Failure Mode Review
- AI Safety Wording Review
- Real Sensor Input Handling Review
- Recommended Model/Preprocessing Improvements

────────────────────────────────
10. n8n workflow and report automation audit
────────────────────────────────

Inspect n8n workflow exports and LLM report API.

Expected workflows may include:

- 00-connectivity-check
- 01-process-pending-llm-reports
- 02-clinical-alert-notifications
- 03-device-health-monitoring
- 04-daily-digest
- 05-recording-summary-enrichment
- 06-ops-monitoring
- 07-alert-escalation

Verify:

- pending report processing
- atomic claim behavior
- retry/failure behavior
- notification workflow
- alert escalation
- daily digest
- device health monitoring
- operational monitoring
- environment variables
- auth/internal token use
- whether N8N_EMAIL_PAYLOAD_EXPORT_ENABLED=false is respected
- whether email payload export is safe
- whether report generation can use demo template mode
- whether report generation can use Claude provider
- whether reports are clearly educational/non-diagnostic
- whether n8n URLs are local-only
- whether n8n works on Hostinger VPS
- whether webhooks require public URLs
- whether credentials are externalized safely

Output:

- n8n Workflow Inventory
- LLM Report Flow Diagram
- Automation Security Review
- Local vs Hostinger VPS n8n Review
- Failure/Retry Risk Report
- Recommended Workflow Improvements

────────────────────────────────
11. Docker, deployment, NGINX, Mosquitto, environment, and Hostinger VPS audit
────────────────────────────────

Inspect:

- docker-compose files
- Dockerfiles
- NGINX config
- Mosquitto config
- .env.example
- .env-related documentation
- cloud deployment docs
- Hostinger VPS deployment docs
- VPS setup docs
- AWS migration docs
- real-device demo docs
- scripts used for deployment

Verify:

- frontend starts correctly
- inference starts correctly
- MQTT TCP port exposure
- MQTT WebSocket port exposure
- NGINX routes to correct services
- health checks
- restart policies
- volume mounts
- model artifact mounting
- Supabase env vars
- firmware/hardware LAN connectivity
- firmware/hardware VPS connectivity
- environment variable consistency
- secrets are not hardcoded
- safe defaults
- production vs demo config
- real-device local network instructions
- Hostinger VPS public domain/IP instructions
- SSL/TLS instructions
- firewall instructions
- Docker network assumptions
- use of localhost
- use of service names
- CORS/trusted hosts
- Supabase redirect URLs
- n8n public webhook URLs

Special focus:

Detect anything that works locally but will fail after deployment to Hostinger VPS, especially:

- hardcoded localhost URLs
- wrong public/private IP assumptions
- Mosquitto bound only to 127.0.0.1
- ESP32 unable to reach MQTT/API endpoints
- missing NGINX reverse proxy paths
- missing SSL/TLS
- blocked VPS firewall ports
- incorrect Supabase redirect/CORS URLs
- frontend using local inference URLs
- n8n using local-only webhook/API URLs
- Docker service names exposed incorrectly to browser or ESP32
- MQTT TCP exposed without authentication
- MQTT WebSocket not routed or secured
- CORS/trusted hosts blocking dashboard or device flows

Produce a dedicated section titled:

“Local-to-Hostinger VPS Migration Review”

Include:

- current local assumptions
- files containing localhost or local-only values
- required Hostinger VPS environment variables
- required NGINX changes
- required Docker Compose changes
- required Mosquitto changes
- required firewall/port checklist
- ESP32 connectivity checklist
- SSL/TLS recommendations
- Supabase configuration checklist
- n8n configuration checklist
- final VPS deployment runbook

Output:

- Deployment Inventory
- Environment Variable Matrix
- Docker Networking Risk Report
- Real Hardware Deployment Checklist
- Hostinger VPS Migration Review
- Recommended Deployment Fixes

────────────────────────────────
12. Code quality, TypeScript, Python, firmware, and tests audit
────────────────────────────────

Run or inspect available commands where possible.

Potential commands to check, if available:

- npm install
- npm run build
- npm run lint
- npm run typecheck
- npm test
- pytest
- python -m pytest
- pip install / requirements validation
- docker compose config
- docker compose build
- Arduino compile feasibility
- firmware static inspection

If you cannot run a command, state why and continue by static inspection.

Check:

- TypeScript errors
- broken imports
- unused components
- inconsistent naming
- duplicated API clients
- weak typing
- missing schemas
- missing runtime validation
- Python exceptions
- blocking async code
- unbounded buffers
- memory leaks
- missing cleanup
- race conditions
- firmware buffer overflows
- firmware timing issues
- ISR misuse
- ADC calibration gaps
- unsafe string handling
- missing tests
- missing mocks/simulators
- missing CI
- missing test data strategy
- missing hardware-in-the-loop test plan
- missing simulator separation from real-data mode

Output:

- Build/Test Command Results
- Static Code Quality Findings
- Firmware Reliability Findings
- Missing Test Coverage
- Recommended Test Plan
- Hardware-in-the-Loop Test Plan

────────────────────────────────
13. Security and privacy audit
────────────────────────────────

Review the full security model across:

- Supabase Auth
- RLS
- organization isolation
- user roles
- admin-only flows
- patient data
- session data
- predictions
- reports
- recordings
- signed URLs
- service-role keys
- frontend env vars
- backend env vars
- internal API tokens
- MQTT credentials
- device secrets
- MQTT ACLs
- password pepper
- NGINX
- CORS
- trusted hosts
- rate limiting
- audit logs
- n8n credentials
- LLM report payloads
- VPS firewall
- TLS/SSL

Identify:

- exposed secrets
- hardcoded credentials
- unsafe client-side service-role usage
- tenant leakage
- public storage buckets
- weak bootstrap flow
- weak device authentication
- weak MQTT authorization
- missing rate limits
- unsafe report payload export
- overexposed operational endpoints
- insufficient audit logging
- production risks on Hostinger VPS

Output:

- Security Architecture Summary
- Critical Security Findings
- Auth/RLS Review
- Device/MQTT Security Review
- Storage/Report Security Review
- VPS Security Checklist
- Recommended Fixes

────────────────────────────────
14. Graduation-project professionalism review
────────────────────────────────

Evaluate the project as a graduation project.

Assess:

- whether the architecture is understandable to examiners
- whether README explains the system clearly
- whether setup steps are reproducible
- whether real hardware mode is documented
- whether local mode is documented
- whether Hostinger VPS deployment is documented
- whether demo/fallback mode is clearly separated from real data
- whether screenshots/diagrams are sufficient
- whether the project avoids medical overclaiming
- whether it clearly states educational/research limitations
- whether each subsystem has a clear role
- whether repository looks polished and maintainable
- whether a live demo can be performed reliably
- whether failure modes are documented
- whether the examiner can understand hardware/software integration

Recommend:

- README improvements
- architecture diagram improvements
- API documentation improvements
- MQTT contract documentation
- hardware setup guide
- Hostinger VPS deployment guide
- demo-day runbook
- troubleshooting guide
- screenshots needed
- examiner-facing explanation
- risk/limitation section
- future-work section
- model-card section
- medical-safety disclaimer section

Output:

- Graduation Readiness Score /100
- Examiner Risk Areas
- Professionalism Improvements
- Suggested README Structure
- Suggested Demo Script
- Suggested Architecture Diagram List
- Suggested Screenshots List

────────────────────────────────
15. Required final answer structure
────────────────────────────────

Your final answer must contain the following sections.

A. Executive Summary

- 10–15 bullets maximum.
- Critical findings first.
- No vague statements.
- Include verified evidence.

B. Repository Coverage Matrix

Table columns:

- Layer
- Expected from project description
- Verified in repository
- Status
- Evidence
- Priority

C. Complete Route/API Inventory

Separate sections:

1. Frontend pages
2. Next.js API routes
3. FastAPI endpoints
4. Supabase Edge Functions, if present
5. MQTT topics
6. n8n workflow triggers/endpoints

D. Real Hardware Data vs Demo Data Audit

Include:

- whether demo data exists
- whether frontend uses mock/demo data
- whether inference uses deterministic fallback predictions
- whether real ESP32-to-MQTT-to-inference path is complete
- whether system can run real-device demo without seeded data
- whether demo mode can accidentally appear in production
- exact files requiring changes

E. Local-to-Hostinger VPS Migration Review

Include:

- local-only assumptions
- localhost findings
- Hostinger VPS env vars needed
- NGINX changes
- Docker Compose changes
- Mosquitto changes
- firewall/port checklist
- ESP32 connectivity checklist
- SSL/TLS recommendations
- Supabase deployed-domain checklist
- n8n deployed-domain checklist
- final VPS runbook

F. Critical Issues

Group by severity:

- Blocker
- High
- Medium
- Low

For each issue include:

- title
- status
- evidence
- impact
- exact file path
- recommended fix
- estimated effort: small / medium / large
- whether it affects demo day
- whether it affects Hostinger VPS deployment
- whether it affects real hardware data flow

G. Hardware-to-Software Connection Improvement Plan

This must be detailed and practical.

Include:

- simplest recommended real-device flow
- local development hardware flow
- Hostinger VPS hardware flow
- dashboard provisioning UX improvements
- firmware command improvements
- bootstrap API improvements
- MQTT connection improvements
- LAN/Docker networking fixes
- VPS networking fixes
- preflight checklist
- real-device demo checklist
- troubleshooting table

H. Security Review

Include:

- auth
- RLS
- tenant isolation
- secrets
- internal tokens
- MQTT credentials
- device secrets
- storage signed URLs
- LLM/n8n payload safety
- CORS/trusted hosts
- audit logs
- VPS firewall
- TLS/SSL

I. AI/Signal Review

Include:

- PCG pipeline
- ECG pipeline
- model artifact loading
- preprocessing
- sample rates
- real sensor input handling
- output wording
- demo-mode behavior
- failure modes

J. Recommended Refactor Roadmap

Split into:

1. Must fix before demo
2. Must fix before Hostinger VPS deployment
3. Should fix before submission
4. Optional polish
5. Future work

For each item include:

- exact files to edit
- reason
- expected result
- test command or manual verification step
- risk if skipped

K. Concrete Patch Suggestions

Provide specific code/file-level changes.

Where safe, include small code snippets or pseudocode.

Do not rewrite the whole project unless requested.

Prioritize:

- hardware/software simplification
- MQTT reliability
- device bootstrap clarity
- localhost-to-VPS fixes
- real-data mode clarity
- demo mode separation
- security hardening
- route/API cleanup

L. Documentation To Add

Provide exact recommended docs:

- HARDWARE_SETUP.md
- MQTT_CONTRACT.md
- API_REFERENCE.md
- HOSTINGER_VPS_DEPLOYMENT.md
- DEMO_RUNBOOK.md
- TROUBLESHOOTING.md
- SECURITY_MODEL.md
- MODEL_CARD.md
- REAL_DATA_VS_DEMO_MODE.md

For each doc include:

- purpose
- required sections
- critical content to include

M. Final Graduation Readiness Score

Give:

- score /100
- explanation
- top 5 changes that would most improve the score
- readiness for local demo
- readiness for real hardware demo
- readiness for Hostinger VPS deployment

────────────────────────────────
16. Style and evidence rules
────────────────────────────────

Use precise engineering language.

Do not use motivational language.

Do not say something exists unless you verified it.

Do not say something works unless you verified it by code inspection, test command, or clear configuration evidence.

Do not make medical claims.

Do not treat AI output as diagnosis.

Use the following labels consistently:

- Verified
- Partially verified
- Not found
- Insufficient data to verify
- Risk
- Recommendation

Where you find a problem, cite exact repository evidence.

Where you make a recommendation, connect it to the exact risk.

Prioritize practical fixes that improve:

- real hardware reliability
- demo-day reliability
- examiner confidence
- Hostinger VPS deployment success
- security posture
- clarity between real data and demo/fallback behavior

Be especially strict about:

- hardware-to-software integration
- real sensor data path
- MQTT topic mismatch
- local Docker vs real ESP32 networking
- local-to-Hostinger VPS migration
- hardcoded localhost values
- API route completeness
- Supabase RLS and tenant isolation
- medical safety wording
- hidden demo/mock behavior
- incomplete placeholder endpoints
- hardcoded secrets
- unreliable provisioning flow
- missing documentation

Begin now by scanning the repository tree, then proceed layer by layer.