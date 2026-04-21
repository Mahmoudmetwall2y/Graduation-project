# SONOCARDIA - ESP32 MicroPython Firmware

AI-powered heart disease detection using heart sounds (PCG) and ECG signals.
Supports two modes: **WebSocket** (live streaming to Flutter app) and **Auto** (recording + Flask server AI pipeline).

## Hardware Requirements

| Component | Description | Pin |
|-----------|-------------|-----|
| ESP32 DevKit | Microcontroller with Wi-Fi | - |
| MAX9814 | Microphone amplifier (heart sounds) | GPIO34 (ADC) |
| AD8232 | ECG heart rate monitor module | GPIO35 (ADC), GPIO32 (LO+), GPIO33 (LO-) |
| Stethoscope | Medical-grade stethoscope head | Connected to MAX9814 |
| Push Button 1 | Start PCG recording | GPIO18 |
| Push Button 2 | Start ECG recording | GPIO19 |
| LED (Green) | Status indicator | GPIO2 (built-in) |
| LED (Blue) | Recording / interaction indicator | GPIO4 |
| LED (Red) | Error indicator (slow blink) | GPIO15 |

## Wiring Diagram

```
ESP32 Pin    Component
─────────    ─────────
3.3V    ──── MAX9814 VDD, AD8232 3.3V
GND     ──── MAX9814 GND, AD8232 GND, Button GND, LED GND
GPIO34  ──── MAX9814 OUT   (heart sound analog signal)
GPIO35  ──── AD8232 OUTPUT (ECG analog signal)
GPIO32  ──── AD8232 LO+    (leads-off detection)
GPIO33  ──── AD8232 LO-    (leads-off detection)
GPIO18  ──── Button 1       (PCG start, pull-up, active LOW)
GPIO19  ──── Button 2       (ECG start, pull-up, active LOW)
GPIO2   ──── Built-in LED   (status)
GPIO4   ──── Blue LED + 220Ω resistor (recording / interaction blink)
GPIO15  ──── Red LED  + 220Ω resistor (error — slow blink until cleared)
```

## LED Behaviour

| LED | GPIO | Behaviour |
|-----|------|-----------|
| Status (green) | 2 | On when system is running |
| Recording (blue) | 4 | Blinks 0.5 s on: client handshake, client disconnect, data batch status (~10 s), Flask server interaction |
| Error (red) | 15 | Slow blink (1 s on / 1 s off) while an error is active; turns off on next successful operation |

## Project Structure

```
esp32/
├── boot.py              # Early init (runs on power-on)
├── main.py              # Main application (runs after boot)
├── config.py            # All configuration constants
├── wifi_manager.py      # Wi-Fi connection management
├── websocket_server.py  # WebSocket server for live streaming to Flutter
├── web_server.py        # HTTP config server
├── combined_capture.py  # Simultaneous PCG + ECG capture
├── pcg_capture.py       # MAX9814 heart sound capture
├── ecg_capture.py       # AD8232 ECG signal capture
├── data_sender.py       # HTTP client to send data to Flask AI server
├── peripherals.py       # LED & button controllers
└── README.md            # This file
```

### Key Modules

| Module | Purpose |
|--------|---------|
| `websocket_server.py` | Runs a WebSocket server on port 8765, streams ECG+PCG at ~20 Hz to the Flutter app. Blinks GPIO4 on handshake/disconnect/status. Blinks GPIO15 on errors. |
| `data_sender.py` | Sends PCG/ECG recordings to Flask AI server via HTTP POST. Blinks GPIO4 on successful sends. Activates GPIO15 error LED on network/server failures. |
| `combined_capture.py` | Records PCG and ECG simultaneously for time-aligned signals. |
| `config.py` | All pin assignments, Wi-Fi credentials, server URLs. Overlays user changes from `config.json` at runtime. |

## Operating Modes

### WebSocket Mode (default)
Live-streams ECG + PCG sensor data to the Flutter mobile app at ~20 Hz.

```
[ESP32] ──WebSocket──▸ [Flutter App]
                         ├── Real-time ECG waveform
                         ├── BPM & HRV analysis
                         ├── PCG volume
                         ├── Arrhythmia detection
                         └── Session recording & playback
```

### Auto Mode
Records PCG/ECG and sends to Flask server for AI classification.

```
[ESP32] ──HTTP POST──▸ [Flask API]
                         ├── XGBoost (PCG normal/murmur)
                         ├── CNN (murmur severity)
                         └── BiLSTM (ECG disease prediction)
```

## Flutter Mobile App

The companion app connects to the ESP32 via WebSocket for real-time cardiac monitoring.

### App Structure

```
sonocardia/lib/
├── main.dart                    # App entry, navigation, .sono file intent handling
├── screens/
│   ├── monitor_screen.dart      # Real-time ECG waveform, BPM, HRV, PCG
│   ├── history_screen.dart      # Recording history, playback, import/share
│   └── settings_screen.dart     # ESP32 IP/port, thresholds, sound toggle
├── services/
│   ├── ecg_processor.dart       # R-peak detection, BPM/HRV computation
│   ├── heart_sound_service.dart # Heart-monitor beep on R-peak, flatline alarm
│   └── recording_service.dart   # Save/load/export/import sessions (.sono format)
└── widgets/
    ├── animated_heart.dart      # Pulsing heart synced to R-peaks
    └── vital_tile.dart          # Stat display tile
```

### Features

| Feature | Description |
|---------|-------------|
| **Real-time ECG** | Live waveform with fl_chart, auto-scaling, ~20 Hz updates |
| **BPM & HRV** | Beat-to-beat heart rate, SDNN, RMSSD |
| **Arrhythmia detection** | Flags irregular rhythm from RR-interval variability |
| **Heart sound beep** | Audible beep on each R-peak, flatline alarm after 7 s silence |
| **Session recording** | Records ECG + BPM + PCG volume to JSON files |
| **ECG playback** | Play/pause/stop, scrub slider, speed control (0.5×–5×) |
| **Auto-scan** | Scans local subnet for ESP32 WebSocket server (parallel port scan) |
| **.sono file format** | Custom file format for sharing & importing ECG sessions |
| **Share** | Export .sono file via WhatsApp, email, or any share target |
| **Import** | Import .sono files via file picker or by tapping a received .sono file |
| **BPM trend chart** | Heart rate trend over the session duration |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `web_socket_channel` | ^3.0.2 | WebSocket client for ESP32 |
| `fl_chart` | ^0.70.2 | ECG waveform & BPM trend charts |
| `audioplayers` | ^6.1.0 | Heart-monitor beep sounds |
| `path_provider` | ^2.1.0 | App documents directory |
| `shared_preferences` | ^2.3.0 | Persistent settings |
| `share_plus` | ^10.1.4 | Share .sono files via system share sheet |
| `file_picker` | ^8.0.0 | Pick .sono files for import |

### .sono File Format

A `.sono` file is a JSON file with a signature header, containing all session data:

```json
{
  "sonocardia_version": 1,
  "format": "sono",
  "id": "1709912345000",
  "startTime": "2026-03-08T14:30:00.000",
  "endTime": "2026-03-08T14:32:15.000",
  "avgBpm": 72,
  "minBpm": 65,
  "maxBpm": 88,
  "sdnn": 45,
  "rmssd": 38,
  "irregularRhythm": false,
  "ecgSamples": [2048, 2052, ...],
  "bpmReadings": [72.5, 73.1, ...],
  "pcgVolumes": [15.0, 18.3, ...]
}
```

**Sharing flow:**
1. User taps **Share** on a session → app exports `.sono` file
2. Doctor receives `.sono` on WhatsApp → taps **Open** → Sonocardia app launches
3. Session auto-imports into History → full ECG playback available

**Manual import:** Tap the file-open icon (📂) in the History screen AppBar.

## Setup Instructions

### 1. Flash MicroPython to ESP32

```bash
# Download MicroPython firmware for ESP32
# https://micropython.org/download/ESP32_GENERIC/

# Erase flash
esptool.py --chip esp32 --port COM3 erase_flash

# Flash MicroPython
esptool.py --chip esp32 --port COM3 --baud 460800 write_flash -z 0x1000 ESP32_GENERIC-20240602-v1.23.0.bin
```

### 2. Upload Files to ESP32

Using **ampy** (Adafruit MicroPython Tool):

```bash
pip install adafruit-ampy

# Upload all files
ampy --port COM3 put boot.py
ampy --port COM3 put main.py
ampy --port COM3 put config.py
ampy --port COM3 put wifi_manager.py
ampy --port COM3 put websocket_server.py
ampy --port COM3 put web_server.py
ampy --port COM3 put combined_capture.py
ampy --port COM3 put pcg_capture.py
ampy --port COM3 put ecg_capture.py
ampy --port COM3 put data_sender.py
ampy --port COM3 put peripherals.py
```

Or using **Thonny IDE**: Open each file and save to MicroPython device.

### 3. Configure

Edit `config.py` before uploading:

```python
WIFI_SSID = "YourNetworkName"
WIFI_PASSWORD = "YourPassword"
SERVER_IP = "192.168.1.100"     # Flask server IP (auto mode only)
SERVER_PORT = 5000
MODE = "websocket"              # "websocket" or "auto"
```

### 4. Run

Power on the ESP32. The system will:

**WebSocket mode:**
1. Connect to Wi-Fi
2. Start WebSocket server on port 8765
3. Stream ECG + PCG data to any connected Flutter app client
4. Blink blue LED on client connect/disconnect

**Auto mode:**
1. Connect to Wi-Fi
2. Test hardware (MAX9814, AD8232)
3. Ping Flask server
4. Wait for button presses
5. Record and send to AI pipeline

## WebSocket Protocol

The ESP32 sends JSON text frames at ~20 Hz:

```json
{
  "ecg": [2048, 2052, 2100, ...],
  "pcg": 1856,
  "volume": 42,
  "ts": 123456789
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ecg` | `int[]` | Batch of ECG ADC samples (12-bit, 0–4095) |
| `pcg` | `int` | Latest PCG raw ADC value |
| `volume` | `int` | Computed PCG volume level (0–100) |
| `ts` | `int` | Timestamp in milliseconds |

## Flask Server API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check / ping |
| `/api/predict/pcg` | POST | Send PCG data for classification |
| `/api/predict/ecg` | POST | Send ECG data for prediction |

### PCG Request Body
```json
{
    "type": "pcg",
    "samples": [1234, 2048, ...],
    "sample_rate": 4000,
    "duration": 10,
    "num_samples": 40000,
    "adc_bits": 12
}
```

### ECG Request Body
```json
{
    "type": "ecg",
    "samples": [2100, 2050, ...],
    "sample_rate": 360,
    "duration": 10,
    "num_samples": 3600,
    "adc_bits": 12,
    "quality": "good"
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `MAX9814 NOT detected` | Check VDD/GND/OUT wiring to GPIO34 |
| `AD8232 NOT detected` | Check wiring, ensure electrodes are attached |
| `Leads OFF` | Reattach ECG electrodes firmly on skin |
| `Wi-Fi connection failed` | Check SSID/password in config.py |
| `Server unreachable` | Verify Flask server IP and that it's running |
| `Memory error` | Reduce `MIC_RECORD_DURATION` or `ECG_RECORD_DURATION` |
| App doesn't get data | Ensure ESP32 IP is correct in Settings; try auto-scan |
| Data stops after hot reload | Use **hot restart** (Shift+R) instead of hot reload |
| Blue LED not blinking | Check GPIO4 wiring and 220Ω resistor |
| Red LED stuck blinking | An error is active — check serial output for details |
