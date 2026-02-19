# SONOCARDIA — ESP32 Firmware

## Overview

Production-ready Arduino firmware for ESP32-WROOM-32 that captures real-time ECG (AD8232) and PCG (MAX9814 analog microphone) signals and streams them via MQTT to the inference service.

## Architecture

Both sensors use analog-to-digital conversion (ADC1) with hardware timers for precise sampling:

| Timer | Sensor | Sample Rate | GPIO |
|-------|--------|-------------|------|
| **Timer 0** | AD8232 ECG | 500 Hz | GPIO 32 |
| **Timer 1** | MAX9814 PCG | 22,050 Hz | GPIO 33 |

PCG uses double-buffering: while one buffer is sent via MQTT, the timer ISR fills the other.

## Setup

### 1. Install Arduino IDE 2.x

Add ESP32 board support:
- **File → Preferences → Additional Board Manager URLs:**
  `https://dl.espressif.com/dl/package_esp32_index.json`
- **Tools → Board → Board Manager →** search "ESP32" → Install

### 2. Install Libraries (Library Manager)

| Library | Author | Purpose |
|---------|--------|---------|
| PubSubClient | Nick O'Leary | MQTT client |
| ArduinoJson | Benoit Blanchon | JSON serialization |

### 3. Flash the Firmware

1. Open `AscultiCor_esp32.ino` in Arduino IDE
2. Select **Board: ESP32 Dev Module**
3. Select your COM port
4. Click **Upload**

### 4. Provision Credentials

Open Serial Monitor (115200 baud) and send:

```
SET device_id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SET device_secret asc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SET org_id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SET mqtt_host 192.168.1.100
SET wifi_ssid YourNetworkName
SET wifi_pass YourPassword
REBOOT
```

Credentials persist in NVS flash across re-flashes.

## Wiring

```
AD8232 (ECG)          MAX9814 (PCG Mic)       Status LED
─────────────         ─────────────────       ──────────
VCC  → 3.3V           VCC  → 3.3V            Anode → GPIO 2
GND  → GND            GND  → GND             Cathode → GND
OUT  → GPIO 32        OUT  → GPIO 33
LO+  → GPIO 34        GAIN → GND (60 dB)
LO-  → GPIO 35        A/R  → float (default)
```

### MAX9814 Gain Settings

| GAIN Pin | Gain |
|----------|------|
| GND | 60 dB (recommended) |
| Float | 50 dB |
| VCC | 40 dB |

> **Note:** The MAX9814 has built-in automatic gain control (AGC). Connect GAIN to GND for maximum sensitivity when used inside a stethoscope housing.

## LED Status Patterns

| Pattern | Meaning |
|---------|---------|
| Slow blink (1 Hz) | Connecting to WiFi/MQTT |
| Solid on | Connected, idle |
| Fast blink (5 Hz) | Streaming data |
| Triple flash | Error |

## Serial Commands

| Command | Action |
|---------|--------|
| `SET <key> <value>` | Save credential to NVS |
| `REBOOT` | Restart ESP32 |
| `STATUS` | Print WiFi/MQTT/streaming status |
| `HELP` | List available commands |

## Changelog

### v3.0 (Paper-aligned)
- ✅ **MAX9814 microphone**: Switched from INMP441 I2S to MAX9814 analog (per SONOCARDIA paper)
- ✅ **Dual hardware timers**: Timer 0 for ECG (500Hz), Timer 1 for PCG (22050Hz)
- ✅ **Double-buffering**: Zero-copy PCG data transfer while ISR captures
- ✅ **Simplified architecture**: Single-core operation (no dual-core task needed)
- ✅ **MAX9814 metadata**: MQTT session info includes mic type and gain

### v2.0
- ✅ **Dual-core**: Audio on Core 0, logic on Core 1
- ✅ **Hardware timer**: Precise 500Hz ECG (was millis-based)
- ✅ **NVS storage**: Credentials persist across re-flashes
- ✅ **WiFi reconnect**: Auto-recovery from WiFi drops
- ✅ **Buffer guards**: Prevents silent MQTT data loss
- ✅ **ADC calibration**: Real mV conversion (12-bit, 11dB)
- ✅ **Leads-off detection**: AD8232 LO+/LO- monitoring
- ✅ **LED patterns**: Visual status feedback
- ✅ **Serial provisioning**: No code changes needed for config
- ✅ **Remote control**: MQTT commands (reboot, stop session)
