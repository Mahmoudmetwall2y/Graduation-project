# ═══════════════════════════════════════════════════════════════
#  AscultiCor Firmware Builder
#
#  Compiles AscultiCor_esp32.ino with arduino-cli inside Docker.
#  No Arduino IDE, drivers, or local toolchain required.
#
#  Layer caching strategy (sizes are approximate):
#    Layer 1  debian:bookworm-slim + curl   ~100 MB  (cached after first pull)
#    Layer 2  arduino-cli binary            ~ 50 MB  (cached after first build)
#    Layer 3  ESP32 Arduino core 2.x        ~350 MB  (cached after first build)
#    Layer 4  PubSubClient + ArduinoJson    ~  5 MB  (cached after first build)
#
#  The entrypoint script is fast on subsequent runs: if the output
#  volume already has the compiled binaries it exits immediately.
#  To force a full recompile:
#    docker volume rm asculticor_firmware_public
#    docker compose up firmware-builder
# ═══════════════════════════════════════════════════════════════

FROM debian:bookworm-slim

# ── 1. System dependencies ───────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*

# ── 2. arduino-cli ───────────────────────────────────────────
# Pinned version for reproducible builds. To upgrade, bump the ARG.
ARG ARDUINO_CLI_VERSION=1.0.4
RUN curl -fsSL \
      https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | VERSION="${ARDUINO_CLI_VERSION}" BINDIR=/usr/local/bin sh \
    && arduino-cli version

# ── 3. Board manager URL for Espressif ESP32 ─────────────────
RUN arduino-cli config init \
    && arduino-cli config set board_manager.additional_urls \
         "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json"

# ── 4. ESP32 Arduino core (~350 MB — cached after first build) ──
# Pinned to 3.x: the firmware uses ESP32 Arduino Core v3 timer APIs
# such as timerBegin(frequency_hz) and timerAlarm(...).
# To upgrade the core, bump ESP32_CORE_VERSION and rebuild:
#   docker compose build firmware-builder
ARG ESP32_CORE_VERSION=3.3.10
RUN arduino-cli core update-index \
    && arduino-cli core install "esp32:esp32@${ESP32_CORE_VERSION}"

# ── 5. Required libraries ────────────────────────────────────
RUN arduino-cli lib install "PubSubClient@2.8.0" \
    && arduino-cli lib install "ArduinoJson@6.21.5"

# ── 6. Python runtime dependencies used by ESP32 build tools ──
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3-serial \
    && rm -rf /var/lib/apt/lists/*

# ── Runtime configuration ────────────────────────────────────
# /AscultiCor_esp32  → bind-mounted read-only  (./firmware/asculticor_esp32/)
# /out     → named volume read-write (firmware_public)
#            This volume is also mounted by the frontend at
#            /app/public/firmware so Next.js serves the binaries.
ENV FQBN=esp32:esp32:esp32:PartitionScheme=custom \
    VERSION=3.1.0 \
    SKETCH_DIR=/AscultiCor_esp32 \
    OUTPUT_DIR=/out
    # ESPTOOL is not needed in this image; AscultiCor uses OTA-first
    # lifecycle management after factory/development bootstrap.

WORKDIR /workspace

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
