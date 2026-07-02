#!/usr/bin/env bash
set -euo pipefail

SKETCH="${SKETCH:-firmware/asculticor_esp32/AscultiCor_esp32/AscultiCor_esp32.ino}"
FQBN="${FQBN:-esp32:esp32:esp32}"
VERSION="${VERSION:-3.0.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/firmware/build"
RELEASE_DIR="$ROOT/firmware/releases"
PUBLIC_DIR="$ROOT/frontend/public/firmware"

mkdir -p "$BUILD_DIR" "$RELEASE_DIR" "$PUBLIC_DIR"

if ! command -v arduino-cli >/dev/null 2>&1; then
  echo "arduino-cli not found locally — falling back to Docker firmware-builder."
  echo "Running: docker compose run --rm firmware-builder"
  cd "$ROOT"
  docker compose run --rm firmware-builder
  echo "Done. Binaries are in the firmware_public Docker volume and served by the frontend."
  exit 0
fi

cd "$ROOT"
arduino-cli compile --fqbn "$FQBN" --export-binaries --output-dir "$BUILD_DIR" "$SKETCH"

APP_BIN="$(find "$BUILD_DIR" -name '*.bin' ! -iname '*bootloader*' ! -iname '*partitions*' | head -n 1)"
BOOTLOADER="$(find "$BUILD_DIR" -iname '*bootloader*.bin' | head -n 1)"
PARTITIONS="$(find "$BUILD_DIR" -iname '*partitions*.bin' | head -n 1)"

if [[ -z "$APP_BIN" || -z "$BOOTLOADER" || -z "$PARTITIONS" ]]; then
  echo "Compile succeeded, but one or more required binaries were not found in $BUILD_DIR." >&2
  exit 1
fi

cp "$APP_BIN" "$RELEASE_DIR/asculticor_esp32_v$VERSION.bin"
cp "$BOOTLOADER" "$RELEASE_DIR/bootloader.bin"
cp "$PARTITIONS" "$RELEASE_DIR/partitions.bin"
cp "$RELEASE_DIR/asculticor_esp32_v$VERSION.bin" "$PUBLIC_DIR/"
cp "$RELEASE_DIR/bootloader.bin" "$PUBLIC_DIR/"
cp "$RELEASE_DIR/partitions.bin" "$PUBLIC_DIR/"

echo "Firmware release binaries copied to firmware/releases and frontend/public/firmware."

