# AscultiCor - AI-Powered Cardiac Monitoring Platform

AscultiCor is a full-stack, real-time cardiac auscultation and monitoring platform that combines IoT hardware (ESP32), MQTT messaging, ML inference, and a modern web dashboard. It enables clinicians to monitor patients' heart sounds (PCG) and electrocardiograms (ECG) with AI-assisted classification.

## Architecture Overview

Data flow:
1. ESP32 devices capture PCG/ECG signals and publish raw data via MQTT.
2. Mosquitto broker authenticates devices and routes messages.
3. Inference Service (FastAPI) subscribes to MQTT topics, runs ML models, and stores predictions in Supabase.
4. Supabase provides PostgreSQL with RLS, auth, and realtime features.
5. Next.js dashboard displays sessions, devices, waveforms, predictions, and LLM-generated reports.

## Key Features

- Real-time ECG/PCG waveforms
- ML classification for PCG and ECG
- Device telemetry (battery, temperature, WiFi signal)
- Responsive UI
- Supabase auth with organization-level RLS
- LLM-based clinical reports (demo mode by default)
- Secure MQTT communication
- Docker Compose deployment

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- A Supabase project (free tier works)

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials.

Configuration notes:
- `LLM_PROVIDER=demo` uses template reports. Set to a real provider only after integration.
- `CORS_ORIGIN` is used by Supabase Edge Functions to restrict origins.

### 2. Apply database migrations

Run the SQL in `supabase/migrations/apply_this_in_supabase.sql` in your Supabase SQL Editor.

### 3. Start all services

```bash
docker-compose up --build -d
```

Services:
- Frontend: `http://localhost:3000`
- Inference API: `http://localhost:8000`
- MQTT Broker: `mqtt://localhost:1883`

### 4. Process LLM report queue (async)

Reports are queued first. To process pending reports:

```bash
curl -X POST "http://localhost:3000/api/llm?action=process-pending" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

Optional: enable `.github/workflows/process-llm-queue.yml` and set repository secrets:
- `ASCULTICOR_APP_URL` (e.g., `https://your-app.example.com`)
- `ASCULTICOR_INTERNAL_API_TOKEN`

### 5. Login

Default credentials (from seed data):
- Email: `admin@asculticor.local`
- Password: `asculticor123`

## Project Structure

```
asculticor/
  frontend/            Next.js 14 web dashboard
  inference/           FastAPI ML inference service
  mosquitto/           MQTT broker
  supabase/            migrations, seed data, edge functions
  simulator/           demo data publisher
```

## Design System

The UI uses a medical-grade design system built with CSS custom properties.

## Recommended Quality Checks

```bash
# Frontend
cd frontend && npm ci && npm run lint && npm run typecheck && npm run build

# Inference
cd ../inference && python -m pip install -r requirements.txt && python -m compileall app
```

## Release Checklist

See `RELEASE_CHECKLIST.md` before demos or deployment.

## Development

### Frontend (local)

```bash
cd frontend
npm install
npm run dev
```

### Inference Service (local)

```bash
cd inference
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## License

This project was developed as a graduation project. All rights reserved.
