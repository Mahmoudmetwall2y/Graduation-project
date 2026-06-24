d# Cloud Device Onboarding Plan

## Summary

For the cloud version, use a pre-flashed ESP32 plus claim-code onboarding flow as the primary path. This is the most professional IoT-style approach because the cloud server does not need USB access, the user does not install local tools, and the device can be added from anywhere.

Keep the current Docker USB flasher only as a local/admin manufacturing tool, not as the main cloud Add Device flow.

## Recommended User Flow

1. Admin opens Add Device in the cloud app.
2. App creates a pending device and shows a short-lived claim code or QR code.
3. User powers on a pre-flashed ESP32.
4. If unprovisioned, ESP32 starts a setup Wi-Fi hotspot, for example `AscultiCor-Setup-XXXX`.
5. User connects to that hotspot and enters:
   - Home/lab Wi-Fi SSID
   - Wi-Fi password
   - Claim code, or scans QR
   - Cloud URL, defaulting to `https://app.your-domain.com`
6. ESP32 connects to Wi-Fi, calls the cloud claim/bootstrap API, and receives device credentials plus MQTT config.
7. ESP32 stores credentials in NVS, connects to MQTT, and appears online in the dashboard.

## Key Changes

- Add a cloud onboarding mode to Add Device:
  - Primary CTA: `Generate claim code`
  - Show QR code and setup instructions.
  - Hide or de-emphasize `Flash from system` when `NEXT_PUBLIC_DEPLOYMENT_MODE=vps`.
- Add a firmware setup portal mode:
  - If no Wi-Fi/device credentials exist, start ESP32 SoftAP.
  - Serve a small local config page from the ESP32.
  - Save Wi-Fi and claim config to NVS.
  - Reboot and claim itself from the cloud.
- Add cloud APIs:
  - `POST /api/devices/claim/start`: creates pending device plus one-time claim token.
  - `POST /api/device/claim`: ESP32 exchanges claim token for `device_id`, `device_secret`, MQTT username/password, org id, and broker host.
  - Claim tokens should expire, for example after 10 minutes, and be single-use.
- Keep existing paths:
  - Docker `firmware-flasher` remains for local development/admin flashing.
  - Browser/Web Serial flashing can be added later as an advanced fallback, but should not be the main cloud path.

## Cloud Requirements

- Set public cloud env values:
  - `NEXT_PUBLIC_APP_URL=https://app.your-domain.com`
  - `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL=https://app.your-domain.com`
  - `MQTT_PUBLIC_HOST=app.your-domain.com`
  - `MQTT_BIND_ADDRESS=0.0.0.0`
- Open required firewall ports:
  - `443` for HTTPS app/bootstrap
  - MQTT port, ideally `8883` for TLS; `1883` is acceptable only for demo/staging.
- For the professional version:
  - Use HTTPS claim/bootstrap.
  - Prefer MQTT over TLS.
  - Bundle the public CA certificate in firmware or support a safe CA config.

## Test Plan

- Fresh ESP32 with empty NVS starts setup hotspot.
- User enters Wi-Fi plus claim code.
- ESP32 claims successfully and stores credentials.
- Device appears online in cloud within 30 seconds.
- Claim token cannot be reused.
- Expired claim token fails cleanly.
- Wrong Wi-Fi credentials keep device in setup/retry mode.
- Turning Wi-Fi off makes device appear offline after the configured timeout.
- Existing local Docker flashing flow still works for lab/admin use.

## Assumptions

- For the graduation project, the best professional story is: devices are pre-flashed once, then cloud onboarding happens without USB.
- The current USB Docker flasher is still useful, but only for local manufacturing/testing.
- If users need to flash totally blank ESP32 boards from the cloud, add browser Web Serial as an advanced fallback, not as the main cloud flow.
