<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/MQTT-Mosquitto-660066?logo=eclipse-mosquitto" alt="MQTT" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker" alt="Docker" />
</p>

# 🫀 AscultiCor — AI-Powered Cardiac Monitoring Platform

**AscultiCor** is a full-stack, real-time cardiac auscultation and monitoring platform that combines IoT hardware (ESP32), MQTT messaging, AI/ML inference, and a modern web dashboard. It enables healthcare professionals to remotely monitor patients' heart sounds (PCG) and electrocardiograms (ECG) with AI-assisted classification.

---

## 🏗️ Architecture Overview

```
┌───────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   ESP32 MCU   │──MQTT──▶│  Mosquitto MQTT   │──sub──▶│ Inference Service│
│  (Sensors)    │         │    Broker         │         │  (FastAPI + ML)  │
└───────────────┘         └──────────────────┘         └────────┬─────────┘
                                                                 │
                                     ┌───────────────────────────┤
                                     ▼                           ▼
                          ┌──────────────────┐         ┌──────────────────┐
                          │   Supabase       │         │   LLM Reports    │
                          │   (PostgreSQL)   │◀────────│  (Gemini/GPT)    │
                          │   Auth + RLS     │         └──────────────────┘
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  Next.js 14      │
                          │  Web Dashboard   │
                          │  (React + SSR)   │
                          └──────────────────┘
```

### Data Flow

1. **ESP32 devices** capture PCG/ECG signals and publish raw audio/waveform data via **MQTT**.
2. **Mosquitto broker** authenticates devices and routes messages.
3. **Inference Service** (FastAPI) subscribes to MQTT topics, runs ML models, and stores predictions in Supabase.
4. **Supabase** provides PostgreSQL with Row-Level Security (RLS), authentication, and real-time capabilities.
5. **Next.js Dashboard** displays sessions, devices, waveforms, predictions, and LLM-generated clinical reports.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 📊 **Real-time Waveforms** | ECG and PCG signal visualization with Recharts |
| 🤖 **AI Classification** | ML model inference for heart sound classification |
| 🌡️ **Device Telemetry** | Battery, temperature, WiFi signal monitoring |
| 📱 **Responsive Design** | Mobile-first UI with dark mode support |
| 🔒 **Multi-tenant Auth** | Supabase authentication with organization-level RLS |
| 📋 **LLM Reports** | AI-generated clinical reports (Gemini/GPT integration) |
| ⚡ **MQTT IoT** | Secure, authenticated MQTT communication with ESP32 |
| 🐳 **Docker Compose** | One-command deployment for all services |

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Node.js](https://nodejs.org/) 18+ (for local frontend development)
- A [Supabase](https://supabase.com/) project (free tier works)

### 1. Clone & Configure

```bash
git clone https://github.com/YOUR_USERNAME/asculticor.git
cd asculticor
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Apply Database Migrations

Run the SQL in `supabase/migrations/apply_this_in_supabase.sql` in your Supabase SQL Editor to set up (including queue retry hardening from `005_llm_queue_retries.sql`):
- Tables (profiles, devices, sessions, predictions, telemetry, alerts, audit logs)
- Row-Level Security (RLS) policies
- Helper functions for multi-tenancy

### 3. Start All Services

```bash
docker-compose up --build -d
```

This starts:
- **Frontend** → [http://localhost:3000](http://localhost:3000)
- **Inference API** → [http://localhost:8000](http://localhost:8000)
- **Mosquitto MQTT** → `mqtt://localhost:1883`



> **If Mosquitto fails with** `entrypoint.sh: no such file or directory`
>
> Rebuild the broker image without cache to ensure the latest entrypoint is embedded:
>
> ```bash
> docker-compose build --no-cache mosquitto
> docker-compose up -d
> ```

### 3.5 Process queued reports (async LLM worker trigger)

LLM report requests are queued first. To process pending reports, call:

```bash
curl -X POST "http://localhost:3000/api/llm?action=process-pending" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

Run this periodically (e.g., cron/GitHub Action/worker scheduler) in production.

Queued report failures now retry automatically with exponential backoff (up to `max_retries`).


### 3.6 Access inference internal endpoints

`/config` and `/metrics` on the inference service are protected by `x-internal-token`.

```bash
curl -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN" http://localhost:8000/config
curl -H "x-internal-token: $INFERENCE_INTERNAL_TOKEN" http://localhost:8000/metrics
```


### 3.7 Optional: schedule queued report processing in GitHub Actions

Add repository secrets:
- `ASCULTICOR_APP_URL` (e.g., `https://your-app.example.com`)
- `ASCULTICOR_INTERNAL_API_TOKEN`

Then enable `.github/workflows/process-llm-queue.yml` to trigger processing every 5 minutes.


### 3.8 Queue observability endpoint

To inspect queue health (pending/generating/error/retry-ready), call:

```bash
curl -H "x-internal-token: $INTERNAL_API_TOKEN" \
  "http://localhost:3000/api/llm?action=queue-stats"
```

### 4. Login

Default credentials (from seed data):
- **Email:** `admin@asculticor.local`
- **Password:** `asculticor123`

---

## 📁 Project Structure

```
asculticor/
├── frontend/                 # Next.js 14 web dashboard
│   ├── src/app/
│   │   ├── components/       # Navbar, ThemeProvider, Skeleton
│   │   ├── auth/login/       # Authentication page
│   │   ├── devices/          # Device management + detail
│   │   ├── session/          # Session monitoring + detail
│   │   ├── admin/            # Admin audit logs
│   │   ├── api/              # Next.js API routes
│   │   ├── globals.css       # Design system (CSS variables)
│   │   └── layout.tsx        # Root layout with ThemeProvider
│   ├── tailwind.config.js
│   └── Dockerfile
├── inference/                # FastAPI ML inference service
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── mqtt_handler.py   # MQTT subscription & processing
│   │   └── models/           # ML model files
│   └── Dockerfile
├── mosquitto/                # MQTT broker
│   ├── config/mosquitto.conf
│   └── Dockerfile
├── supabase/
│   ├── migrations/           # SQL migration scripts
│   └── seed.sql              # Initial seed data
├── docker-compose.yml
└── README.md
```

---

## 🎨 Design System

The UI uses a **medical-grade design system** built with CSS custom properties:

- **Colors:** Teal primary, rose accents, amber warnings — no generic blues/reds
- **Dark Mode:** Full dark theme with system preference detection
- **Components:** Glass-morphism cards, gradient buttons, skeleton loaders, pulse animations
- **Typography:** Inter (Google Fonts) with tight tracking
- **Charts:** Recharts for ECG/PCG waveforms and activity visualizations

---



## ✅ Recommended quality checks

See `IMPLEMENTATION_PLAN_NEXT_STEPS.md` for the current phased roadmap.


Before merging production changes, run:

```bash
# Frontend
cd frontend && npm ci && npm run lint && npm run typecheck && npm run build

# Inference
cd ../inference && python -m pip install -r requirements.txt && python -m compileall app
```

A GitHub Actions CI workflow is included to run equivalent checks on pushes and pull requests.

## 🔧 Development

### Frontend (Local)

```bash
cd frontend
npm install
npm run dev    # → http://localhost:3000
```

### Inference Service (Local)

```bash
cd inference
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## 🧪 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Recharts |
| Backend API | FastAPI (Python), Pydantic |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Messaging | Eclipse Mosquitto (MQTT 3.1.1) |
| ML/AI | PyTorch / TensorFlow (PCG/ECG classification) |
| LLM | Google Gemini / OpenAI GPT for clinical reports |
| DevOps | Docker Compose, multi-stage Dockerfiles |
| Auth | Supabase Auth with JWT + Row-Level Security |

---

## 📄 License

This project was developed as a **graduation project** for the Faculty of Engineering. All rights reserved.

---

<p align="center">
  Built with ❤️ for better cardiac care
</p>
