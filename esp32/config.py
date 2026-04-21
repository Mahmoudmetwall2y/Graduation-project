# ============================================================
# SONOCARDIA - ESP32 Configuration
#
# Hardcoded DEFAULTS live here.  At runtime the wifi_manager
# and web_server modules overlay values from config.json
# (if it exists on flash) so user changes persist across
# reboots.  Use load_config() / save_config() below to
# read/write the JSON file from any module.
# ============================================================

import json as _json

# --- Device Identity ---
DEVICE_NAME = "SONOCARDIA"     # Used as AP SSID suffix and shown in the app

# --- Operating Mode ---
#   "websocket" = live streaming to Flutter app
#   "auto"      = auto-recording + Flask server AI pipeline
MODE = "websocket"

# --- Wi-Fi Configuration ---
WIFI_SSID = "JO66"
WIFI_PASSWORD = "TYUtyu12355"

# --- WebSocket Server Configuration ---
WEBSOCKET_PORT = 8765          # Port for Flutter app connection
WS_BATCH_INTERVAL_MS = 50      # Send data every 50ms (~20 Hz update rate)

# --- Flask Server Configuration ---
SERVER_IP = "192.168.1.100"    # Flask AI server address (auto mode only)
SERVER_PORT = 5000
SERVER_URL_PCG = "/api/predict/pcg"
SERVER_URL_ECG = "/api/predict/ecg"

# --- MAX9814 Microphone (Heart Sound) Configuration ---
MIC_PIN = 34              # ADC1 channel (GPIO34) - analog input
MIC_SAMPLE_RATE = 4000   # Sampling rate in Hz (heart sounds are 20-400Hz)
MIC_RECORD_DURATION = 10  # Recording duration in seconds
MIC_BITS = 12             # ADC resolution (ESP32 = 12-bit)
PCG_OVERSAMPLE = 16       # PCG reads per ECG tick (effective PCG rate = 360*16 = 5760 Hz)

# Canonical PCG sample rate used across the project. Set this to the
# microphone sampling rate so modules can reference a single source
# of truth. Defaults to the microphone rate above.
PCG_SAMPLE_RATE = 4000

# --- AD8232 ECG Module Configuration ---
ECG_PIN = 35              # ADC1 channel (GPIO35) - analog input
ECG_LO_PLUS_PIN = 32      # Leads-off detection LO+
ECG_LO_MINUS_PIN = 33     # Leads-off detection LO-
ECG_SAMPLE_RATE = 360     # Sampling rate in Hz (matches MIT-BIH standard)
ECG_RECORD_DURATION = 10  # ECG recording duration in seconds

# --- LED Indicators ---
LED_STATUS_PIN = 2        # Built-in LED for status
LED_RECORDING_PIN = 4     # External LED for recording indication
LED_ERROR_PIN = 21        # External LED for error indication
LED_RECORDING_INVERT = True  # True if LED is wired active-LOW (between 3.3V and GPIO)

# --- Spare GPIO (reserved for future use) ---
SPARE_PIN = 21            # GPIO21 — available for expansion, kept OFF

# --- Button Pins (kept for reference, not used in auto mode) ---
BTN_START_PCG_PIN = 18    # Button to start heart sound recording
BTN_START_ECG_PIN = 19    # Button to start ECG recording
BTN_RESET_PIN = 0         # Multi-function boot/reset button (GPIO0)
BTN_RESET_DEBOUNCE_MS = 500  # Debounce time for reset button

# --- Auto-Recording Settings ---
CYCLE_DELAY_SECONDS = 30  # Seconds between recording cycles
RECORD_COUNTDOWN = 3      # Countdown before recording starts
LEADS_WAIT_TIMEOUT = 60   # Max seconds to wait for ECG leads

# --- General Settings ---
DEBUG = True              # Enable debug prints
DATA_FORMAT = "json"      # Data transmission format
BUFFER_SIZE = 1024        # Network buffer size

# ── config.json persistence helpers ──────────────────────────
_CONFIG_FILE = "config.json"


def load_config():
    """
    Load config.json from flash.

    Returns a dict with saved keys.  Returns {} if the file
    does not exist or is corrupt.
    """
    try:
        with open(_CONFIG_FILE, "r") as f:
            return _json.load(f)
    except Exception:
        return {}


def save_config(cfg: dict):
    """
    Write *cfg* dict to config.json on flash.

    Merges with any existing keys so callers can save
    partial updates.
    """
    existing = load_config()
    existing.update(cfg)
    with open(_CONFIG_FILE, "w") as f:
        _json.dump(existing, f)
    if DEBUG:
        print(f"[Config] Saved: {existing}")
