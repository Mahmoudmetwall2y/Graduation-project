# ============================================================
# SONOCARDIA - boot.py
# Runs automatically when the ESP32 powers on.
#
# 1. If the reset/setup button (GPIO0) is HELD during boot,
#    skip Wi-Fi STA entirely and go straight to AP setup mode.
# 2. Otherwise, try STA; fall back to AP if it fails.
# ============================================================

import gc
import esp
import machine

# Disable vendor OS debug output to keep serial clean
esp.osdebug(None)

# Force ALL LED GPIOs OFF immediately
machine.Pin(2, machine.Pin.OUT).off()
machine.Pin(15, machine.Pin.OUT).off()
# Recording LED is wired active-LOW — set HIGH to turn it off
machine.Pin(4, machine.Pin.OUT).on()
# Spare pin (GPIO21) — active-LOW, set HIGH to turn off
machine.Pin(21, machine.Pin.OUT).on()

# Run garbage collection early to maximise free heap
gc.collect()

print("[Boot] SONOCARDIA ESP32 booting...")
print(f"[Boot] Free memory: {gc.mem_free()} bytes")

# ── Check reset/setup button FIRST (polled, no IRQ) ──
from peripherals import ResetButton

_setup_btn = ResetButton()
_force_ap = _setup_btn.is_held_at_boot(hold_ms=1000)

# Arm the runtime reset IRQ so the button works in ALL modes
# (setup portal, websocket server, auto-recording, etc.)
_setup_btn.enable_runtime_reset()

if _force_ap:
    print("[Boot] ** Setup button held — forcing AP mode **")

# ── WiFi (STA → AP fallback) ──
from wifi_manager import WiFiManager

wifi = WiFiManager()

if _force_ap:
    # Skip STA entirely — jump straight to AP + captive portal
    wifi.start_ap()
    wifi.run_captive_portal()
    # (never reaches here — machine.reset() is called inside)
else:
    mode = wifi.start()          # returns "STA" or "AP"

    if mode == "AP":
        # Captive portal blocks here until user saves config → reboot
        wifi.run_captive_portal()
        # (never reaches here — machine.reset() is called inside)
    else:
        ip_info = wifi.sta.ifconfig()
        print(f"[Boot] IP Address : {ip_info[0]}")
        print(f"[Boot] Subnet     : {ip_info[1]}")
        print(f"[Boot] Gateway    : {ip_info[2]}")
        print(f"[Boot] DNS        : {ip_info[3]}")

gc.collect()
print(f"[Boot] Free memory after WiFi: {gc.mem_free()} bytes")
