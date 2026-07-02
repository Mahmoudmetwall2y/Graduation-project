#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  firmware-builder entrypoint
#  Compiles AscultiCor_esp32.ino and writes the .bin files plus
#  manifest.json to the shared Docker volume so the frontend
#  can serve them for browser-based flashing via ESP Web Tools.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

BANNER="[firmware-builder]"

echo "${BANNER} ════════════════════════════════════════════"
echo "${BANNER}  AscultiCor Firmware Builder"
echo "${BANNER}  FQBN    : ${FQBN}"
echo "${BANNER}  Version : ${VERSION}"
echo "${BANNER}  Sketch  : ${SKETCH_DIR}"
echo "${BANNER}  Output  : ${OUTPUT_DIR}"
echo "${BANNER} ════════════════════════════════════════════"

# ── Fast path: binaries already in the volume ────────────────
if [ -f "${OUTPUT_DIR}/asculticor_esp32_v${VERSION}.bin" ] && \
   [ -f "${OUTPUT_DIR}/manifest.json" ]; then
  echo "${BANNER} ✓ Firmware binaries already present — skipping compilation."
  echo "${BANNER}   Refresh the browser to use the flash button."
  echo "${BANNER}   To force a rebuild:"
  echo "${BANNER}     docker volume rm asculticor_firmware_public"
  echo "${BANNER}     docker compose up firmware-builder"
  exit 0
fi

# ── Compile ──────────────────────────────────────────────────
echo "${BANNER} Starting compilation (first run ~2-3 min, subsequent runs use cache)..."
mkdir -p /build "${OUTPUT_DIR}"

WORK_SKETCH_DIR="/workspace/$(basename "${SKETCH_DIR}")"
rm -rf "${WORK_SKETCH_DIR}"
mkdir -p "${WORK_SKETCH_DIR}"
cp -a "${SKETCH_DIR}/." "${WORK_SKETCH_DIR}/"

arduino-cli compile \
  --fqbn "${FQBN}" \
  --export-binaries \
  --output-dir /build \
  "${WORK_SKETCH_DIR}"

echo "${BANNER} Compilation successful. Locating output binaries..."

APP_BIN=$(find /build -name "*.bin" \
  ! -iname "*bootloader*" \
  ! -iname "*partitions*" \
  ! -iname "*merged*" \
  | head -n 1)
BOOT_BIN=$(find /build -iname "*bootloader*.bin" | head -n 1)
PART_BIN=$(find /build -iname "*partitions*.bin" | head -n 1)

if [ -z "${APP_BIN}" ] || [ -z "${BOOT_BIN}" ] || [ -z "${PART_BIN}" ]; then
  echo "${BANNER} ERROR: One or more expected .bin files were not found in /build" >&2
  ls -la /build/ >&2 || true
  exit 1
fi

echo "${BANNER} Found:"
echo "${BANNER}   App        : ${APP_BIN}"
echo "${BANNER}   Bootloader : ${BOOT_BIN}"
echo "${BANNER}   Partitions : ${PART_BIN}"

# ── Copy to shared volume ────────────────────────────────────
cp "${APP_BIN}"  "${OUTPUT_DIR}/asculticor_esp32_v${VERSION}.bin"
cp "${BOOT_BIN}" "${OUTPUT_DIR}/bootloader.bin"
cp "${PART_BIN}" "${OUTPUT_DIR}/partitions.bin"

APP_SHA256=$(sha256sum "${OUTPUT_DIR}/asculticor_esp32_v${VERSION}.bin" | awk '{print $1}')
APP_SIZE=$(stat -c%s "${OUTPUT_DIR}/asculticor_esp32_v${VERSION}.bin")

# ── Generate manifest.json ───────────────────────────────────
# This overrides the stub manifest.json baked into the frontend image.
# ESP Web Tools reads this file to know which binary to flash and at
# which flash offset.
cat > "${OUTPUT_DIR}/manifest.json" << MANIFEST
{
  "name": "AscultiCor ESP32 Firmware",
  "version": "${VERSION}",
  "chipFamily": "ESP32",
  "description": "AscultiCor firmware for ESP32-WROOM-32 with AD8232 ECG, MAX9814 PCG, JSON serial provisioning, NVS storage, bootstrap, MQTT streaming, heartbeat, and preflight support.",
  "ota": {
    "path": "/firmware/asculticor_esp32_v${VERSION}.bin",
    "sha256": "${APP_SHA256}",
    "size": ${APP_SIZE}
  },
  "parts": [
    { "path": "/firmware/bootloader.bin", "offset": 4096 },
    { "path": "/firmware/partitions.bin", "offset": 32768 },
    { "path": "/firmware/asculticor_esp32_v${VERSION}.bin", "offset": 65536 }
  ]
}
MANIFEST

# Make files world-readable so the nextjs user (uid 1001) can serve them
chmod 644 "${OUTPUT_DIR}"/*.bin "${OUTPUT_DIR}/manifest.json"

echo "${BANNER} ✓ All firmware files ready in ${OUTPUT_DIR}:"
ls -lh "${OUTPUT_DIR}/"
echo "${BANNER} ✓ The flash button on /devices/add is now active."
