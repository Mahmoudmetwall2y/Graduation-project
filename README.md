# AscultiCor - Real-Time Patient Monitoring System

**Graduation Project - Production-Quality Full-Stack System**

## Overview

AscultiCor is a real-time patient signal monitoring system that captures PCG (heart sound) and ECG data from ESP32 devices, performs ML inference, and provides a professional web interface for operators and administrators.

### Key Features

- **Real-time streaming**: MQTT-based high-rate data ingestion with TLS support
- **ML Pipeline**: 3 deterministic models (PCG classifier, Murmur severity, ECG predictor)
- **Secure Storage**: Supabase with strict RLS policies and org isolation
- **Professional UI**: Next.js with real-time updates via Supabase Realtime
- **LLM Insights**: Safe, educational AI-powered result explanations
- **Demo Mode**: Full system testing without ESP32 hardware

## Architecture

### Two-Plane Realtime Design

1. **High-Rate Streaming Plane (MQTT)**
   - Binary audio/signal chunks over TLS
   - Local: Mosquitto broker
   - Production: AWS IoT Core ready
   - QoS 0 for data, QoS 1 for control

2. **Low-Rate App-State Plane (Supabase Realtime)**
   - Session status updates
   - Device presence
   - Live metrics (1-5 Hz)
   - Inference results
   - Never raw waveforms

### Components

```
┌─────────────────┐
│   ESP32 Device  │ (or Demo Simulator)
└────────┬────────┘
         │ MQTT/TLS
         ↓
┌─────────────────┐
│    Mosquitto    │ (Local) / AWS IoT Core (Prod)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Inference/      │ Python FastAPI
│ Ingress Service │ - MQTT subscriber
│                 │ - ML inference
│                 │ - Supabase writer
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│    Supabase     │ - Auth
│                 │ - Postgres + RLS
│                 │ - Storage
│                 │ - Realtime
│                 │ - Edge Functions
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Next.js UI    │ - TypeScript
│                 │ - Tailwind + shadcn
│                 │ - Realtime subscriptions
└─────────────────┘
```

## Quick Start (One Command)

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local dev)
- Supabase account (free tier works)

### Setup

1. **Clone and configure**:
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

2. **Seed database**:
```bash
# Run migrations and seed data
cd supabase
# Follow Supabase setup instructions in supabase/README.md
```

3. **Start all services**:
```bash
docker compose up --build
```

This starts:
- Frontend (http://localhost:3000)
- Inference service (http://localhost:8000)
- Mosquitto MQTT broker (mqtt://localhost:1883)

4. **Run demo simulator**:
```bash
# In another terminal
python3 simulator/demo_publisher.py
```

### Default Credentials (Seed Data)

- **Admin**: admin@cardiosense.local / cardiosense123
- **Operator**: operator@cardiosense.local / cardiosense123
- **Organization**: AscultiCor Demo Org
- **Device**: demo-device-001 / secret: demo_secret_2024

## ML Models

### 1. PCG Classifier (XGBoost)
- **Input**: 10-second PCG audio (22.05 kHz)
- **Output**: {Normal, Murmur, Artifact} + probabilities
- **Preprocessing**: MFCC features, bandpass 20-400 Hz

### 2. Murmur Severity (CNN Multi-Head)
- **Trigger**: Only if PCG == Murmur
- **Output**: 6 severity dimensions:
  - Location (AV, MV, PV, TV)
  - Timing (systolic, diastolic, continuous)
  - Shape (crescendo, decrescendo, plateau)
  - Grading (I/VI to VI/VI)
  - Pitch (low, medium, high)
  - Quality (blowing, harsh, rumbling)

### 3. ECG Predictor (BiLSTM)
- **Input**: 500-sample ECG window (500 Hz)
- **Output**: Prediction label + confidence
- **Preprocessing**: Bandpass 0.5-50 Hz, z-score normalization

### Demo Mode
If models are not found, the system runs in Demo Mode with deterministic mock outputs. This allows full UI/pipeline testing without trained models.

## Configuration

All services are configurable via environment variables:

### Inference Service (`inference/.env`)
```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# MQTT
MQTT_BROKER=mosquitto
MQTT_PORT=1883
MQTT_USERNAME=cardiosense
MQTT_PASSWORD=xxx

# ML Settings
PCG_SAMPLE_RATE=22050
PCG_TARGET_DURATION=10
ECG_SAMPLE_RATE=500
ECG_WINDOW_SIZE=500

# Limits
PCG_MAX_DURATION=15
ECG_MAX_DURATION=60
STREAM_TIMEOUT_SEC=10
METRICS_UPDATE_HZ=2
```

### Frontend (`frontend/.env.local`)
```bash
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_MQTT_WS_URL=ws://localhost:9001
```

## User Roles & Permissions

### Operator (Default)
- Create sessions
- View sessions in their organization
- Manage owned devices
- View inference results

### Admin
- All operator permissions
- Manage users (invite, change roles)
- Manage all devices in org
- View audit logs
- Access retention settings

## Database Schema

### Core Tables
- `organizations`: Multi-tenant isolation
- `profiles`: User profiles with roles
- `devices`: Registered ESP32 devices
- `sessions`: Recording sessions with status
- `recordings`: Raw signal storage metadata
- `predictions`: ML inference results
- `murmur_severity`: Detailed murmur analysis
- `live_metrics`: Real-time quality metrics
- `audit_logs`: Security and compliance tracking

### RLS (Row Level Security)
All tables enforce strict org-level isolation. Users can only access data within their organization.

## MQTT Topics

### Topic Structure
```
org/{orgId}/device/{deviceId}/session/{sessionId}/
  ├── meta     (JSON, QoS 1) - control messages
  ├── pcg      (binary, QoS 0) - audio chunks
  ├── ecg      (binary, QoS 0) - signal chunks
  └── heartbeat (JSON, QoS 0) - keepalive
```

### Message Flow
1. Device publishes `start_pcg` to `meta`
2. Device streams binary chunks to `pcg` topic
3. Inference service buffers and processes
4. Device publishes `end_pcg` to `meta`
5. Service runs inference and stores results
6. UI updates via Supabase Realtime

## LLM Insights (Safe & Educational)

The system includes an AI assistant that:
- ✅ Explains ML outputs in plain language
- ✅ Provides educational context
- ✅ Highlights data quality concerns
- ✅ Lists general limitations
- ❌ Never diagnoses conditions
- ❌ Never recommends treatments
- ❌ Never replaces clinical evaluation

**Always includes**: "Research/Educational use only. Not a medical diagnosis."

## Testing

### Automated Tests
```bash
# RLS tests
cd supabase && npm test

# Inference service tests
cd inference && pytest

# Frontend tests
cd frontend && npm test
```

### Manual Testing Checklist
- [ ] Login as admin and operator
- [ ] Create session with demo simulator
- [ ] Verify real-time status updates
- [ ] Check PCG prediction appears
- [ ] Verify murmur severity (if triggered)
- [ ] Check ECG prediction appears
- [ ] Generate LLM insights
- [ ] Download recording
- [ ] Export results as JSON/CSV
- [ ] Test device registration (admin)
- [ ] Verify operator cannot access other org data

## Production Deployment (AWS)

### Migration Path
1. **MQTT**: Replace Mosquitto with AWS IoT Core
   - Update MQTT broker URL to AWS IoT endpoint
   - Use X.509 certificates for device auth
   - Same topic structure

2. **Inference Service**: Deploy to ECS/EC2
   - Container behind ALB
   - Auto-scaling based on MQTT throughput
   - CloudWatch logs and metrics

3. **Frontend**: S3 + CloudFront or Vercel
   - Static export for S3
   - Or Next.js on Vercel/Amplify

4. **Secrets**: AWS Secrets Manager
   - Rotate Supabase service keys
   - Device secrets
   - MQTT credentials

5. **Scaling Considerations**:
   - Multiple inference instances need shared Redis for session buffers
   - Or partition MQTT topics by device ID

See `docs/AWS_MIGRATION.md` for detailed guide.

## Troubleshooting

### MQTT Connection Issues
```bash
# Test broker connectivity
mosquitto_sub -h localhost -p 1883 -t "org/#" -u cardiosense -P xxx
```

### Inference Service Not Processing
```bash
# Check logs
docker compose logs -f inference

# Verify health
curl http://localhost:8000/health
```

### Realtime Updates Not Working
- Check Supabase Realtime is enabled in dashboard
- Verify anon key has correct permissions
- Check browser console for WebSocket errors

### Models Not Loading
- System will run in Demo Mode automatically
- Check `inference/models/` directory
- Verify model file names match config

## Project Structure

```
cardiosense/
├── docker-compose.yml          # One-command startup
├── .env.example                # Template for all env vars
├── README.md                   # This file
├── docs/                       # Additional documentation
│   └── AWS_MIGRATION.md
├── frontend/                   # Next.js app
│   ├── src/
│   │   ├── app/               # App router pages
│   │   ├── components/        # React components
│   │   ├── lib/              # Utilities
│   │   └── hooks/            # Custom hooks
│   ├── Dockerfile
│   └── package.json
├── inference/                  # Python service
│   ├── app/
│   │   ├── main.py           # FastAPI app
│   │   ├── mqtt_handler.py   # MQTT subscriber
│   │   ├── inference.py      # ML pipeline
│   │   ├── preprocessing.py  # Signal processing
│   │   └── supabase_client.py
│   ├── models/               # ML model files (.pkl, .h5, .pt)
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── mosquitto/                  # MQTT broker config
│   ├── config/
│   │   └── mosquitto.conf
│   └── Dockerfile
├── supabase/                   # Database & backend
│   ├── migrations/            # SQL migrations
│   ├── functions/             # Edge functions
│   ├── seed.sql              # Initial data
│   └── README.md
└── simulator/                  # Demo device
    ├── demo_publisher.py      # MQTT test client
    ├── sample_data/           # Test signals
    └── README.md
```

## License

MIT License - Educational/Research Use

## Support

For issues or questions:
1. Check troubleshooting section
2. Review logs: `docker compose logs -f`
3. Check Supabase dashboard for RLS/auth issues
4. Verify MQTT with `mosquitto_sub`

---

**Important**: This system is for research and educational purposes only. It is not a medical device and should not be used for clinical decision-making.
