# Contract: Live Predictions WebSocket (MQTT over WS)

**Endpoint:** `ws://localhost:9001` (to be proxied to `wss://api.domain.com/mqtt`)
**Protocol:** MQTT 3.1.1 or 5.0 (over WebSockets)
**Topic Pattern:** `sensors/+/predictions`

## Payload Schema (JSON)

Every 500ms, the Inference Engine publishes a compiled prediction payload for the active edge device. 

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "device_id": {
      "type": "string",
      "description": "UUID of the patient hardware device.",
      "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 creation timestamp from the ML pipeline."
    },
    "ecg_arrhythmia": {
      "type": "string",
      "enum": ["Normal beat", "Premature ventricular contraction", "Atrial premature beat", "Left bundle branch block beat", "Right bundle branch block beat"]
    },
    "pcg_sound": {
      "type": "string",
      "enum": ["Normal", "Abnormal", "Artifact"]
    },
    "pcg_severity": {
      "type": "object",
      "properties": {
        "AS": { "type": "string", "enum": ["Mild", "Moderate", "Severe", "None"] },
        "MR": { "type": "string", "enum": ["Mild", "Moderate", "Severe", "None"] },
        "AR": { "type": "string", "enum": ["Mild", "Moderate", "Severe", "None"] },
        "MS": { "type": "string", "enum": ["Mild", "Moderate", "Severe", "None"] },
        "MVP": { "type": "string", "enum": ["Mild", "Moderate", "Severe", "None"] },
        "TC": { "type": "string", "enum": ["Mild", "Moderate", "Severe", "None"] }
      },
      "required": ["AS", "MR", "AR", "MS", "MVP", "TC"]
    },
    "confidence_score": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    }
  },
  "required": ["device_id", "timestamp", "ecg_arrhythmia", "pcg_sound", "pcg_severity", "confidence_score"]
}
```

## Consumer Responsibilities (Frontend React)

1. Connect to `9001` with `clean_session: true`.
2. Subscribe to `sensors/+/predictions` with `QoS 0` (speed prioritized over guaranteed delivery).
3. On network drop, fallback to polling the Supabase `/api/devices` REST endpoint until the `paho-mqtt` client fires the `connect` event again.
