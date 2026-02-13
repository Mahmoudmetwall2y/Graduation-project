# AscultiCor - Fixed and Optimized

## Summary of Changes Made

### 1. Docker Configuration (Fixed)
- **docker-compose.yml**: Removed empty lines, enabled frontend service, fixed formatting
- **inference/Dockerfile**: Already had curl installed for health checks
- **mosquitto/Dockerfile**: Configuration verified and working

### 2. Frontend Implementation (Complete)
Created a full Next.js 14 application with:
- **Authentication**: Login page with Supabase auth
- **Dashboard**: Session list with real-time status
- **Session Management**: Create new sessions, view session details
- **Session Detail**: Real-time updates via Supabase Realtime, predictions display
- **Device Management**: Register and view devices
- **Admin Panel**: Audit logs view (admin only)
- **Protected Routes**: Middleware for authentication

### 3. Backend Services (Verified)
- **Inference Service**: FastAPI with MQTT handler, ML inference engine
- **MQTT Broker**: Mosquitto with WebSocket support
- **Demo Mode**: Works without ML models

### 4. Database (Verified)
- **Schema**: Complete with 9 tables
- **RLS Policies**: All tables have proper row-level security
- **Indexes**: Optimized for common queries

### 5. Demo Simulator (Verified)
- Generates synthetic PCG and ECG signals
- Publishes to MQTT broker
- Simulates real-time streaming

## Quick Start

### Prerequisites
1. Docker Desktop installed and running
2. Supabase project configured
3. `.env` file with credentials

### Start the System
```bash
# Windows
start.bat

# Or manually
docker-compose up --build
```

### Access the Application
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000/health
- **MQTT**: mqtt://localhost:1883

### Run Demo
```bash
python simulator/demo_publisher.py
```

## Architecture

```
┌─────────────┐      MQTT       ┌──────────────┐
│   Demo      │ ───────────────> │  Inference   │
│  Simulator  │                  │   Service    │
└─────────────┘                  └──────┬───────┘
                                        │
                                        │ Supabase
                                        ▼
                               ┌─────────────────┐
                               │   Supabase      │
                               │  - Database     │
                               │  - Storage      │
                               │  - Realtime     │
                               └────────┬────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │   Next.js       │
                               │    Frontend     │
                               └─────────────────┘
```

## File Structure

```
cardiosense/
├── docker-compose.yml          # Fixed - all services enabled
├── .env                        # Your Supabase credentials
├── frontend/                   # Complete Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/health/     # Health check endpoint
│   │   │   ├── auth/login/     # Login page
│   │   │   ├── session/
│   │   │   │   ├── new/        # Create session
│   │   │   │   └── [id]/       # Session detail
│   │   │   ├── devices/        # Device management
│   │   │   ├── admin/          # Admin panel
│   │   │   ├── layout.tsx      # Root layout
│   │   │   ├── page.tsx        # Dashboard
│   │   │   └── globals.css     # Tailwind styles
│   │   ├── lib/supabase.ts     # Supabase client
│   │   └── middleware.ts       # Auth middleware
│   ├── package.json            # Added auth-helpers-nextjs
│   ├── tailwind.config.js      # Tailwind config
│   └── next.config.js          # Next.js config
├── inference/                  # Python FastAPI service
│   ├── app/
│   │   ├── main.py            # FastAPI app
│   │   ├── mqtt_handler.py    # MQTT subscriber
│   │   ├── inference.py       # ML engine
│   │   ├── preprocessing.py   # Signal processing
│   │   └── supabase_client.py # Database client
│   ├── Dockerfile             # Service container
│   └── requirements.txt       # Python deps
├── mosquitto/                  # MQTT broker
│   ├── config/
│   │   └── mosquitto.conf     # Broker config
│   └── Dockerfile
├── simulator/                  # Demo device simulator
│   └── demo_publisher.py      # MQTT test client
└── supabase/                   # Database
    ├── migrations/
    │   └── 001_initial_schema.sql
    └── seed.sql
```

## Features Implemented

### Authentication & Authorization
- Supabase Auth integration
- Role-based access control (operator/admin)
- Protected routes middleware
- Session persistence

### Real-Time Features
- Supabase Realtime subscriptions
- Live session status updates
- Live predictions display
- Device heartbeat tracking

### Session Management
- Create recording sessions
- Monitor session status (created → streaming → processing → done)
- View session details and results
- Historical session list

### ML Inference
- PCG classification (Normal/Murmur/Artifact)
- Murmur severity analysis (6 dimensions)
- ECG prediction (Normal/Abnormal)
- Demo mode for testing without models

### Device Management
- Register new devices
- View device list
- Track last seen status
- Device authentication

### Admin Features
- Audit logs viewer
- System monitoring
- User management (via Supabase)

## API Endpoints

### Inference Service
- `GET /health` - Service health check
- `GET /config` - Configuration settings
- `GET /metrics` - Active sessions and buffers

### Frontend API
- `GET /api/health` - Health check

## Environment Variables

Required in `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MQTT_USERNAME=cardiosense
MQTT_PASSWORD=cardiosense123
```

## Troubleshooting

### Services Won't Start
```bash
# Check Docker is running
docker info

# View logs
docker-compose logs -f [service_name]

# Restart
docker-compose down
docker-compose up --build
```

### Frontend Build Errors
```bash
cd frontend
npm install
npm run build
```

### MQTT Connection Issues
```bash
# Test with mosquitto client
mosquitto_sub -h localhost -p 1883 -t "org/#"
```

### Database Issues
- Verify Supabase credentials in `.env`
- Check RLS policies are applied
- Enable Realtime for tables in Supabase dashboard

## Performance Optimizations

1. **Docker Build**: Multi-stage builds for smaller images
2. **Frontend**: Static generation where possible
3. **Database**: Indexes on frequently queried columns
4. **MQTT**: QoS levels optimized (0 for data, 1 for control)
5. **Caching**: Inference service caches preprocessing results

## Security Features

1. **RLS Policies**: All tables have row-level security
2. **Authentication**: JWT-based auth via Supabase
3. **Authorization**: Role-based access (operator/admin)
4. **Audit Logging**: All actions logged
5. **Input Validation**: Pydantic models in FastAPI
6. **CORS**: Configured for production

## Next Steps

### To Complete the System
1. Train actual ML models and place in `inference/models/`
2. Add more comprehensive error handling
3. Implement data export functionality
4. Add LLM insights integration
5. Set up monitoring and alerts

### For Production
1. Use AWS IoT Core instead of Mosquitto
2. Deploy to ECS/EC2 for inference service
3. Use S3 + CloudFront for frontend
4. Enable SSL/TLS everywhere
5. Set up log aggregation
6. Configure auto-scaling

## Support

For issues:
1. Check logs: `docker-compose logs -f`
2. Verify environment variables
3. Test individual components
4. Review this documentation

---

**Status**: ✅ All systems operational
**Last Updated**: 2026-02-08
**Version**: 1.0.0
