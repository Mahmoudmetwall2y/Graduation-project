# ============================================================
# SONOCARDIA - Wi-Fi Manager with Captive Portal Fallback
#
# Flow:
#   1. Load config from config.json (falls back to config.py)
#   2. Try STA (station) mode for 10 seconds
#   3. If STA fails → start AP "SONOCARDIA_SETUP" (open)
#   4. Serve captive portal via web_server.py
#   5. User submits config → saved to config.json → reboot
#
# LED Indicators (non-blocking, Timer-based):
#   GPIO 2 (status_led):
#     - Slow blink (1 Hz)  → connecting to WiFi
#     - Solid ON           → WiFi connected (STA mode)
#     - Fast blink (4 Hz)  → AP mode / captive portal active
#   GPIO 4 (server_led):
#     - Solid ON           → WebSocket server running
#     - OFF                → server not started
# ============================================================

import network
import machine
import time
import gc
from config import (
    WIFI_SSID, WIFI_PASSWORD,
    LED_STATUS_PIN, LED_RECORDING_PIN, LED_RECORDING_INVERT,
    DEBUG,
)

# ── Try loading saved configuration ──────────────────────────
_cfg = {}
try:
    import json as _json
    with open("config.json", "r") as _f:
        _cfg = _json.load(_f)
    if DEBUG:
        print("[WiFi] Loaded config.json")
except Exception:
    if DEBUG:
        print("[WiFi] No config.json — using defaults from config.py")

_SSID     = _cfg.get("ssid", WIFI_SSID)
_PASSWORD = _cfg.get("password", WIFI_PASSWORD)

_DEV_NAME = _cfg.get("device_name", "SONOCARDIA")
AP_SSID   = f"{_DEV_NAME}_SETUP"
STA_TIMEOUT  = 10       # seconds to try STA before falling back
RECONNECT_RETRIES = 3
RECONNECT_DELAY   = 2


# ──────────────────────────────────────────────────────────────
# Non-blocking LED blinker (hardware Timer, no time.sleep)
# ──────────────────────────────────────────────────────────────
class _LEDBlinker:
    """Toggle a GPIO pin at a given frequency using a hardware Timer."""

    def __init__(self, pin_num, timer_id=-1, invert=False):
        self.pin = machine.Signal(
            machine.Pin(pin_num, machine.Pin.OUT), invert=invert
        )
        self.pin.off()
        self._timer = machine.Timer(timer_id)
        self._timer.deinit()                     # clear stale callbacks from prior boot
        self._running = False

    def solid_on(self):
        self.stop()
        self.pin.on()

    def solid_off(self):
        self.stop()
        self.pin.off()

    def blink(self, freq_hz=1):
        """Start blinking at *freq_hz* full on/off cycles per second."""
        self.stop()
        period = max(int(1000 / (freq_hz * 2)), 50)   # half-period in ms
        self._running = True
        self._timer.init(
            period=period,
            mode=machine.Timer.PERIODIC,
            callback=self._toggle,
        )

    def stop(self):
        if self._running:
            self._timer.deinit()
            self._running = False

    def _toggle(self, _t):
        self.pin.value(not self.pin.value())


# ──────────────────────────────────────────────────────────────
# WiFiManager
# ──────────────────────────────────────────────────────────────
class WiFiManager:
    """
    Manages STA connection with automatic AP captive-portal fallback.

    Usage::

        wm = WiFiManager()
        mode = wm.start()           # "STA" or "AP"
        if mode == "AP":
            wm.run_captive_portal() # blocks until user saves config → reboot
    """

    def __init__(self):
        self.sta = network.WLAN(network.STA_IF)
        self.ap  = network.WLAN(network.AP_IF)
        self.mode = None                          # "STA" | "AP" | None

        # Non-blocking LED indicators
        self.led_wifi   = _LEDBlinker(LED_STATUS_PIN,    timer_id=0)
        self.led_server = _LEDBlinker(LED_RECORDING_PIN, timer_id=1, invert=LED_RECORDING_INVERT)

    # ─────────────────────────────────────────────────────────
    # High-level entry point
    # ─────────────────────────────────────────────────────────
    def start(self):
        """
        Try STA, fall back to AP on failure.

        Returns
        -------
        str : "STA" if connected, "AP" if captive portal started.
        """
        self.ap.active(False)                    # ensure AP off for STA attempt

        ip = self._connect_sta(timeout=STA_TIMEOUT)
        if ip:
            self.mode = "STA"
            self.led_wifi.solid_on()
            print(f"[WiFi] STA connected — IP {ip}")
            return "STA"

        # STA failed → captive portal
        print("[WiFi] STA failed — launching Access Point...")
        self._start_ap()
        self.mode = "AP"
        self.led_wifi.blink(freq_hz=4)           # fast blink = AP
        return "AP"

    def start_ap(self):
        """Force AP mode directly (e.g. when setup button held at boot)."""
        print("[WiFi] Forcing Access Point mode...")
        self._start_ap()
        self.mode = "AP"
        self.led_wifi.blink(freq_hz=4)

    # ─────────────────────────────────────────────────────────
    # Captive portal
    # ─────────────────────────────────────────────────────────
    def run_captive_portal(self):
        """
        Launch the HTTP config server (blocks until user saves).
        After saving config.json the ESP32 will machine.reset().
        """
        gc.collect()
        from web_server import CaptivePortalServer
        server = CaptivePortalServer()
        server.run()                             # blocks → machine.reset()

    # ─────────────────────────────────────────────────────────
    # STA helpers
    # ─────────────────────────────────────────────────────────
    def _connect_sta(self, timeout=STA_TIMEOUT):
        """Attempt STA connection.  Returns IP string or None."""
        self.sta.active(True)

        if self.sta.isconnected():
            ip = self.sta.ifconfig()[0]
            if DEBUG:
                print(f"[WiFi] Already connected: {ip}")
            return ip

        if DEBUG:
            print(f"[WiFi] Connecting to '{_SSID}' (timeout {timeout}s)...")

        self.led_wifi.blink(freq_hz=1)           # slow blink = connecting

        self.sta.connect(_SSID, _PASSWORD)

        start = time.time()
        while not self.sta.isconnected():
            if time.time() - start > timeout:
                if DEBUG:
                    print("[WiFi] STA timed out.")
                self.led_wifi.solid_off()
                return None
            time.sleep(0.5)

        ip = self.sta.ifconfig()[0]
        return ip

    def connect(self, timeout=15):
        """Legacy connect() — used by main.py / auto mode.  Returns IP or None."""
        return self._connect_sta(timeout=timeout)

    # ─────────────────────────────────────────────────────────
    # AP helpers
    # ─────────────────────────────────────────────────────────
    def _start_ap(self):
        """Bring up an open AP named SONOCARDIA_SETUP."""
        self.sta.active(False)
        self.ap.active(True)
        self.ap.config(essid=AP_SSID, authmode=network.AUTH_OPEN)
        time.sleep(1)                            # let AP settle
        ip_info = self.ap.ifconfig()
        print(f"[WiFi] AP '{AP_SSID}' active — IP {ip_info[0]}")

    # ─────────────────────────────────────────────────────────
    # Backward-compatible helpers
    # ─────────────────────────────────────────────────────────
    def disconnect(self):
        """Disconnect STA and deactivate AP."""
        self.led_wifi.solid_off()
        self.led_server.solid_off()
        if self.sta.isconnected():
            self.sta.disconnect()
        self.sta.active(False)
        self.ap.active(False)
        if DEBUG:
            print("[WiFi] Disconnected.")

    def is_connected(self):
        """True when STA is active and associated."""
        return self.sta.active() and self.sta.isconnected()

    def get_ip(self):
        """Current STA IP or None."""
        if self.is_connected():
            return self.sta.ifconfig()[0]
        return None

    def get_signal_strength(self):
        """RSSI in dBm, or None."""
        if self.is_connected():
            try:
                return self.sta.status("rssi")
            except Exception:
                return None
        return None

    def reconnect(self, max_retries=RECONNECT_RETRIES, delay=RECONNECT_DELAY):
        """Try to reconnect STA.  Returns True on success."""
        if DEBUG:
            print(f"[WiFi] Reconnecting (max {max_retries})...")

        for attempt in range(1, max_retries + 1):
            if DEBUG:
                print(f"[WiFi] Attempt {attempt}/{max_retries}...")
            self.sta.active(False)
            time.sleep(1)
            ip = self._connect_sta(timeout=STA_TIMEOUT)
            if ip:
                self.led_wifi.solid_on()
                if DEBUG:
                    print(f"[WiFi] Reconnected: {ip}")
                return True
            time.sleep(delay)

        if DEBUG:
            print("[WiFi] All reconnection attempts failed.")
        return False

    def ensure_connected(self):
        """Ensure STA is connected; reconnect if needed."""
        if not self.is_connected():
            if DEBUG:
                print("[WiFi] Connection lost — reconnecting...")
            return self.reconnect()
        return True

    def set_server_led(self, on=True):
        """Control the server/connectivity LED (GPIO 4)."""
        if on:
            self.led_server.solid_on()
        else:
            self.led_server.solid_off()
