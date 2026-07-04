# AscultiCor ESP32 Firmware Releases

Firmware binaries not found. Created manifest/build structure only.

Expected release files:

- `bootloader.bin`
- `partitions.bin`
- `asculticor_esp32_v3.1.0.bin`
- `manifest.json`

The dashboard reads `/firmware/manifest.json` from `frontend/public/firmware/manifest.json`.
After generating binaries, copy the same `.bin` files into:

- `firmware/releases/`
- `frontend/public/firmware/`

Do not commit placeholder or invented binary files.

