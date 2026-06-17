# Serial Provisioning Protocol

Baud rate: `115200`.

Protocol: one JSON object per line.

Provision:

```json
{
  "cmd": "provision",
  "device_id": "dev-or-uuid",
  "device_secret": "secret",
  "bootstrap_url": "https://example.com/api/device/bootstrap",
  "wifi_ssid": "Clinic-WiFi",
  "wifi_pass": "password"
}
```

Expected response:

```json
{"status":"ok","stage":"saved_to_nvs","device_id":"...","firmware_version":"3.0.0"}
```

Commands:

| Command | Purpose |
| --- | --- |
| `provision` | Save device, Wi-Fi, bootstrap, optional MQTT fields to NVS |
| `status` | Report firmware, provisioning, Wi-Fi, MQTT, IP, mode |
| `reboot` | Acknowledge then restart ESP32 |
| `reset_provisioning` | Clear saved NVS provisioning keys |
| `preflight` | Check AD8232/MAX9814 signal availability |
| `test_ecg` | Run preflight response with ECG fields |
| `test_pcg` | Run preflight response with PCG fields |

Secret-handling rules:

- Firmware masks Wi-Fi password, device secret, and MQTT password in serial logs.
- Dashboard masks secrets in UI logs.
- Do not paste service-role keys, MQTT admin credentials, or patient data into serial.

Legacy `SET <key> <value>` commands remain available for manual fallback.

