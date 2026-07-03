# AscultiCor ESP32 Wi-Fi Onboarding and OTA

AscultiCor firmware `3.1.0` replaces the server-side USB flasher with an OTA-first device lifecycle.

## Initial bootstrap

A completely blank ESP32 still requires bootstrap firmware to be installed by the manufacturer or once during development. Production boards should be delivered with the AscultiCor bootstrap image and OTA partition table preloaded.

After boot, an unprovisioned device creates:

```text
AscultiCor-Setup-XXXX
```

Connect a phone or laptop to that network. In AscultiCor, create the device and enter the real Wi-Fi credentials. The app generates a QR code whose value is a local ESP32 URL:

```text
http://192.168.4.1/provision?payload=...
```

Scan it with the phone camera after joining `AscultiCor-Setup-XXXX`. The ESP32 receives and saves:

- Local Wi-Fi SSID and password
- Device ID
- Device secret
- Public AscultiCor bootstrap URL

Manual entry at `http://192.168.4.1` remains available as a fallback. The device stores provisioning values in NVS, restarts, obtains scoped MQTT credentials, and begins reporting status.

## Firmware release

The one-shot `firmware-builder` produces:

- The factory bootloader
- The OTA-capable partition table
- The application-only OTA binary
- A manifest containing the OTA binary path, byte size, and SHA-256 digest

The server-side USB flasher container and `/api/device/flash` and `/api/device/provision` proxy routes have been removed.

## OTA rollout

An administrator opens the device Settings tab and selects **Queue Latest Firmware**. This:

1. Synchronizes the built firmware manifest into `firmware_releases`.
2. Creates an auditable `firmware_deployments` row.
3. Lets n8n Workflow 03 dispatch the MQTT update command.
4. Makes the ESP32 download the application image.
5. Verifies its SHA-256 digest before activating it.
6. Reboots and reports the installed firmware version.
7. Marks the deployment successful after the new version checks in.

Firmware is not installed during an active recording.

## Deployment requirements

- Apply `20260702163301_device_firmware_ota.sql`.
- Rebuild `firmware-builder`, `frontend`, and `inference`.
- Ensure `DEVICE_BOOTSTRAP_PUBLIC_BASE_URL` is HTTPS and reachable by the ESP32.
- Configure a trusted CA certificate in device provisioning for production HTTPS. Insecure TLS is development-only.
- Import and validate `04-device-ota-management.json` in n8n after deployment.

## Current safety boundary

The implementation verifies transport trust and SHA-256 integrity. Production medical-device work should additionally introduce signed firmware with Secure Boot, flash encryption, formal release approval, staged cohorts, and automatic rollback acceptance criteria.
