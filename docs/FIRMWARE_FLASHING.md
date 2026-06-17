# Firmware Flashing

Firmware binaries not found. Created manifest/build structure only.

Browser flashing target:

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

Manual fallback: open `firmware/asculticor_esp32/AscultiCor_esp32.ino`, compile for ESP32-WROOM-32, upload, then use JSON serial provisioning.

Recommendation: add CI that runs Arduino CLI compile and publishes release binaries as artifacts.

