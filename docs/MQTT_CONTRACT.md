# MQTT Contract

Topic prefix:

`org/{org_id}/device/{device_id}`

| Topic | Direction | Payload | QoS | Retain |
| --- | --- | --- | --- | --- |
| `.../status` | ESP32 -> broker | JSON status | 1 | true |
| `.../control` | dashboard/backend -> ESP32 | JSON command | 1 | false |
| `.../session/{session_id}/meta` | ESP32 -> broker | JSON lifecycle/preflight | 1 | false |
| `.../session/{session_id}/heartbeat` | ESP32 -> broker | JSON heartbeat | 0 | false |
| `.../session/{session_id}/ecg` | ESP32 -> broker | raw int16 ECG chunk | 0 | false |
| `.../session/{session_id}/pcg` | ESP32 -> broker | raw int16 PCG chunk | 0 | false |

Status payload fields include `status`, `ip`, `rssi`, `firmware_version`, `mode`, `wifi`, `mqtt`, `free_heap`, and `streaming`.

ECG expectations:

- AD8232
- Around 500 Hz from firmware
- Raw signed 16-bit chunks

PCG expectations:

- MAX9814
- Around 22,050 Hz target
- Raw signed 16-bit chunks

Preflight messages:

- `preflight_ok`
- `preflight_failed`
- Include ECG lead-off, ECG signal, PCG signal, PCG clipping, and reason.

