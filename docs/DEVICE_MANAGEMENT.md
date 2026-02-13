# AscultiCor Device Management System - Complete Guide

## Overview

AscultiCor now supports **unlimited ESP32 devices** with individual dashboards, recordings, and LLM reports for each device. This guide explains how to add devices, monitor them, and manage everything from the web interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AscultiCor System                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ ESP32 #1 │  │ ESP32 #2 │  │ ESP32 #N │   Multiple Devices  │
│  │ Patient  │  │ Patient  │  │ Patient  │                     │
│  │ Room 101 │  │ Room 102 │  │ Room 10N │                     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                     │
│       │             │             │                            │
│       └─────────────┴─────────────┘                            │
│                     │                                          │
│                     ▼                                          │
│          ┌──────────────────┐                                 │
│          │   MQTT Broker    │                                 │
│          │  (Mosquitto/AWS) │                                 │
│          └────────┬─────────┘                                 │
│                   │                                            │
│       ┌───────────┼───────────┐                               │
│       ▼           ▼           ▼                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                         │
│  │Inference│ │Supabase │ │Next.js  │                         │
│  │Service  │ │Database │ │Frontend │                         │
│  └────┬────┘ └────┬────┘ └────┬────┘                         │
│       │           │           │                                │
│       └───────────┴───────────┘                                │
│                   │                                            │
│                   ▼                                            │
│          ┌──────────────────┐                                 │
│          │   Web Dashboard  │                                 │
│          │  (All Devices)   │                                 │
│          └──────────────────┘                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 1. **Multi-Device Support**
- ✅ Add unlimited ESP32 devices
- ✅ Individual device dashboards
- ✅ Device groups for organization
- ✅ Real-time status monitoring
- ✅ Battery and signal strength tracking

### 2. **Individual Device Dashboards**
- ✅ Overview of device status
- ✅ All sessions per device
- ✅ Telemetry data (temperature, battery, WiFi)
- ✅ Active alerts
- ✅ Device settings

### 3. **LLM Reports**
- ✅ Generate AI analysis per session
- ✅ View historical reports
- ✅ Educational insights with medical disclaimers
- ✅ Downloadable PDF reports

### 4. **Device Management**
- ✅ Add/remove devices
- ✅ Edit device info
- ✅ Device credentials management
- ✅ Firmware version tracking
- ✅ Group organization

## Quick Start

### Step 1: Add Your First Device

1. **Go to Device Management:**
   - Navigate to http://localhost:3000/devices
   - Click **"Add Device"**

2. **Fill Device Information:**
   ```
   Device Name: Patient Room 101
   Device Type: ESP32
   ```

3. **Save Credentials:**
   After creation, you'll see:
   ```
   Device ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Secret Key: asc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Organization ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   
   **⚠️ IMPORTANT:** Save these immediately! You won't see the secret key again.

### Step 2: Configure ESP32 Firmware

Update your ESP32 code with the credentials:

```cpp
// Device Configuration
const char* device_id = "YOUR_DEVICE_ID";
const char* device_secret = "YOUR_SECRET_KEY";
const char* org_id = "YOUR_ORG_ID";

// MQTT Topics will be:
// org/{org_id}/device/{device_id}/session/{session_id}/meta
// org/{org_id}/device/{device_id}/session/{session_id}/pcg
// org/{org_id}/device/{device_id}/session/{session_id}/ecg
```

### Step 3: Flash and Connect

1. Flash the firmware to ESP32
2. Power on the device
3. Device will automatically connect and appear as "online"

### Step 4: View Device Dashboard

1. Go to `/devices` - see all devices
2. Click on a device card
3. View individual dashboard with:
   - Real-time status
   - Session history
   - Telemetry graphs
   - LLM reports

## Database Schema

### New Tables Added

#### 1. device_groups
Organize devices into logical groups (e.g., by department, floor, etc.)

```sql
CREATE TABLE device_groups (
    id UUID PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    location TEXT
);
```

#### 2. Enhanced devices Table
```sql
ALTER TABLE devices ADD COLUMN:
- device_group_id: UUID (for grouping)
- device_type: TEXT (esp32, esp32-s3, etc.)
- firmware_version: TEXT
- hardware_version: TEXT
- status: TEXT (online/offline/error/maintenance)
- battery_level: INTEGER (0-100)
- signal_strength: INTEGER (RSSI dBm)
- calibration_data: JSONB
- sensor_config: JSONB
- notes: TEXT
```

#### 3. device_telemetry
Real-time health metrics from devices

```sql
CREATE TABLE device_telemetry (
    id UUID PRIMARY KEY,
    device_id UUID REFERENCES devices(id),
    temperature_celsius NUMERIC,
    uptime_seconds BIGINT,
    free_heap_bytes BIGINT,
    wifi_rssi INTEGER,
    battery_voltage NUMERIC,
    recorded_at TIMESTAMPTZ
);
```

#### 4. llm_reports
AI-generated analysis reports

```sql
CREATE TABLE llm_reports (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES sessions(id),
    device_id UUID REFERENCES devices(id),
    model_name TEXT,
    prompt_text TEXT,
    report_text TEXT,
    report_json JSONB,
    confidence_score NUMERIC,
    status TEXT (pending/generating/completed/error)
);
```

#### 5. device_alerts
System alerts and notifications

```sql
CREATE TABLE device_alerts (
    id UUID PRIMARY KEY,
    device_id UUID REFERENCES devices(id),
    alert_type TEXT (offline/low_battery/error/anomaly/maintenance),
    severity TEXT (info/warning/critical),
    message TEXT,
    is_resolved BOOLEAN
);
```

## API Endpoints

### Device Management

#### 1. List All Devices
```http
GET /api/devices

Response:
{
  "devices": [
    {
      "id": "uuid",
      "device_name": "Patient Room 101",
      "device_type": "esp32",
      "status": "online",
      "last_seen_at": "2024-01-15T10:30:00Z",
      "battery_level": 85,
      "signal_strength": -45,
      "sessions": [{"count": 15}]
    }
  ]
}
```

#### 2. Create New Device
```http
POST /api/devices
Content-Type: application/json

{
  "device_name": "Patient Room 102",
  "device_type": "esp32"
}

Response:
{
  "device": { ... },
  "credentials": {
    "device_id": "uuid",
    "device_secret": "asc_...",
    "org_id": "uuid"
  }
}
```

#### 3. Get Device Details
```http
GET /api/devices/{device_id}

Response:
{
  "device": { ... },
  "telemetry": [...],
  "summaries": [...],
  "alerts": [...],
  "stats": {
    "totalSessions": 15,
    "completedSessions": 12,
    "totalRecordings": 30,
    "activeAlerts": 0
  }
}
```

#### 4. Update Device
```http
PATCH /api/devices/{device_id}
Content-Type: application/json

{
  "device_name": "Updated Name",
  "notes": "Additional information"
}
```

#### 5. Delete Device
```http
DELETE /api/devices/{device_id}
```

### LLM Reports

#### 1. Generate Report
```http
POST /api/llm/generate-report
Content-Type: application/json

{
  "session_id": "uuid",
  "device_id": "uuid"
}

Response:
{
  "report": {
    "id": "uuid",
    "status": "completed",
    "report_text": "Educational analysis...",
    "report_json": { ... }
  }
}
```

#### 2. List Reports
```http
GET /api/llm/reports?device_id={uuid}

Response:
{
  "reports": [
    {
      "id": "uuid",
      "device": {"device_name": "..."},
      "session": {"status": "done"},
      "status": "completed",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## Frontend Pages

### 1. Device List (`/devices`)
- Grid view of all devices
- Status indicators (online/offline/error)
- Quick stats (battery, signal, sessions)
- Add device modal

### 2. Device Dashboard (`/devices/{id}`)
Tabs:
- **Overview**: Recent sessions, active alerts
- **Sessions**: All recordings with LLM report buttons
- **Telemetry**: Health metrics history
- **Alerts**: System notifications
- **Settings**: Device info, credentials, delete

### 3. Session Detail (`/session/{id}`)
- Device-specific session data
- Predictions and analysis
- LLM report viewer

## Adding Multiple Devices

### Example: Adding 5 Devices

```javascript
// Device configurations
const devices = [
  { name: "ICU Bed 1", type: "esp32" },
  { name: "ICU Bed 2", type: "esp32" },
  { name: "Cardiology Room A", type: "esp32-s3" },
  { name: "Emergency Bay 3", type: "esp32" },
  { name: "Recovery Room 5", type: "esp32" }
];

// Create each device
devices.forEach(async (dev) => {
  const response = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dev)
  });
  
  const data = await response.json();
  console.log(`Device ${dev.name}:`, data.credentials);
  // Save credentials for each ESP32
});
```

### Organizing with Groups

```sql
-- Create groups
INSERT INTO device_groups (org_id, name, description) VALUES
('org-uuid', 'ICU Unit', 'Intensive Care devices'),
('org-uuid', 'Cardiology', 'Cardiology department'),
('org-uuid', 'Emergency', 'Emergency room devices');

-- Assign devices to groups
UPDATE devices SET device_group_id = 'group-uuid' WHERE id = 'device-uuid';
```

## ESP32 Multi-Device Configuration

Each ESP32 needs unique credentials:

```cpp
// Device 1 Configuration
#ifdef DEVICE_1
const char* device_id = "device-uuid-1";
const char* device_secret = "secret-1";
const char* device_name = "ICU Bed 1";
#endif

// Device 2 Configuration
#ifdef DEVICE_2
const char* device_id = "device-uuid-2";
const char* device_secret = "secret-2";
const char* device_name = "ICU Bed 2";
#endif
```

Compile with:
```bash
# For Device 1
pio run -e device1 -- -DDEVICE_1

# For Device 2
pio run -e device2 -- -DDEVICE_2
```

## Real-Time Features

### 1. Live Status Updates
Devices automatically update status via:
- MQTT connection state
- Heartbeat messages every 5 seconds
- Telemetry data streaming

### 2. WebSocket Subscriptions
Frontend subscribes to real-time updates:
```typescript
const channel = supabase
  .channel(`device-${deviceId}`)
  .on('postgres_changes', { 
    event: 'UPDATE', 
    table: 'devices',
    filter: `id=eq.${deviceId}`
  }, callback)
  .subscribe();
```

### 3. Alert System
Automatic alerts for:
- Device goes offline
- Low battery (< 20%)
- Signal strength poor (< -80 dBm)
- High temperature (> 60°C)
- Errors in data transmission

## LLM Report Generation

### 1. Manual Generation
Click "LLM Report" button on any completed session

### 2. Automatic Generation
Configure auto-generation in device settings:
```json
{
  "auto_generate_llm_report": true,
  "generate_on": "session_complete"
}
```

### 3. Report Content
Each report includes:
- Educational summary of findings
- Key observations
- Suggested follow-up actions
- Medical disclaimer
- Technical notes

Example Report:
```markdown
## Educational Analysis Summary

**⚠️ MEDICAL DISCLAIMER**: This analysis is for educational purposes only...

### Findings Overview
The PCG analysis indicates normal heart sounds with regular S1 and S2 patterns...

### ECG Analysis
Normal sinus rhythm without significant arrhythmias...

### Suggested Follow-up
1. Clinical Review: Share with cardiologist
2. Comparison: Compare with previous recordings
3. Additional Testing: Consider cardiac workup

### Limitations
- Limited-duration recording
- AI analysis should be confirmed by professionals
- System operates in demo mode
```

## Best Practices

### 1. Device Naming Convention
```
[Location] [Identifier]
Examples:
- "ICU Bed 1"
- "Cardiology Room A"
- "Emergency Bay 3"
- "Recovery Room 5"
```

### 2. Group Organization
```
ICU Unit
├── ICU Bed 1
├── ICU Bed 2
└── ICU Bed 3

Cardiology
├── Room A
├── Room B
└── Stress Test Lab
```

### 3. Credential Management
- Store credentials securely
- Use environment variables in firmware
- Rotate keys periodically
- Keep backup of all device credentials

### 4. Monitoring
- Check device status daily
- Review battery levels weekly
- Monitor signal strength
- Address alerts promptly

## Troubleshooting

### Device Not Connecting
1. Check WiFi credentials
2. Verify device credentials (ID, secret, org)
3. Check MQTT broker connection
4. Review ESP32 serial logs

### No Data Received
1. Check sensor connections
2. Verify I2S configuration for microphone
3. Check ADC pin for ECG
4. Monitor MQTT topics

### Dashboard Not Updating
1. Check Supabase Realtime is enabled
2. Verify RLS policies
3. Check browser console for errors
4. Refresh page

### LLM Report Generation Fails
1. Check session has completed
2. Verify predictions exist
3. Check API endpoint is accessible
4. Review server logs

## Scaling Considerations

### 1. Database
- Index all query columns
- Archive old telemetry data
- Use connection pooling
- Monitor query performance

### 2. MQTT Broker
- Use clustered broker for 100+ devices
- Implement QoS 1 for critical messages
- Monitor topic subscription count
- Set message retention policies

### 3. Inference Service
- Scale horizontally with load balancer
- Use Redis for session state
- Implement rate limiting
- Monitor GPU/CPU usage

### 4. Frontend
- Implement pagination for device lists
- Use virtual scrolling for long lists
- Cache device data locally
- Optimize re-renders

## Migration from Single Device

If upgrading from single-device setup:

1. **Backup existing data:**
```sql
-- Export current device
COPY (SELECT * FROM devices WHERE id = 'old-device-id') TO '/tmp/old_device.csv';
```

2. **Run migration:**
```bash
# Apply new schema
psql -f supabase/migrations/002_device_management_enhancement.sql
```

3. **Update existing device:**
```sql
UPDATE devices 
SET device_type = 'esp32',
    status = 'offline'
WHERE id = 'old-device-id';
```

4. **Add new devices** using the web interface

## Summary

You now have a complete multi-device management system!

### Key Capabilities:
- ✅ Add unlimited ESP32 devices
- ✅ Individual device dashboards
- ✅ Real-time monitoring
- ✅ LLM reports per session
- ✅ Device groups and organization
- ✅ Alert system
- ✅ Telemetry tracking
- ✅ Full API access

### Next Steps:
1. Run the database migration
2. Enable Realtime for new tables
3. Add your first device
4. Configure ESP32 with credentials
5. Monitor from the dashboard!

For questions or issues, check the troubleshooting section or review the API documentation.

Happy monitoring! 🏥💓
