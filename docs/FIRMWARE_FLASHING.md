# Firmware Bootstrap and OTA

The server-side Docker USB flasher has been retired. AscultiCor now uses Wi-Fi onboarding and verified OTA updates.

Firmware binaries not found. Created manifest/build structure only.

The following factory artifacts are still generated for manufacturer/development bootstrap:

- Manifest: `/firmware/manifest.json`
- Release source: `firmware/releases/manifest.json`
- Public files: `frontend/public/firmware/`

Expected binaries:

- `bootloader.bin`
- `partitions.bin`
- `asculticor_esp32_v3.0.0.bin`

Generate binaries:

```powershell
.\scripts\build-firmware.ps1
```

or:

```bash
./scripts/build-firmware.sh
```

Requirements:

- Arduino CLI
- ESP32 Arduino core
- PubSubClient
- ArduinoJson

After bootstrap firmware is installed, onboarding uses the temporary `AscultiCor-Setup-XXXX` Wi-Fi network and all later application updates use OTA.

See `docs/DEVICE_OTA_LIFECYCLE.md`.

