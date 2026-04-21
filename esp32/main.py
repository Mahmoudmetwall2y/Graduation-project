# ============================================================
# SONOCARDIA - Main Application (Auto Mode + Dual-Core)
#
# On boot the ESP32 automatically:
#   1. Connects to Wi-Fi
#   2. Waits for ECG leads
#   3. Records PCG + ECG simultaneously (in-phase, dual-core)
#   4. Sends both to the Flask server
#   5. Displays results
#   6. Waits CYCLE_DELAY_SECONDS, then repeats
#
# No buttons required — fully automatic operation.
# ============================================================

import time
import gc
from config import (
    DEBUG,
    CYCLE_DELAY_SECONDS,
    RECORD_COUNTDOWN,
    LEADS_WAIT_TIMEOUT,
)

# Overlay cycle delay from config.json if available
try:
    import json as _json_cfg
    with open("config.json", "r") as _f_cfg:
        _mcfg = _json_cfg.load(_f_cfg)
    CYCLE_DELAY_SECONDS = _mcfg.get("cycle_delay", CYCLE_DELAY_SECONDS)
except Exception:
    pass

from wifi_manager import WiFiManager
from combined_capture import CombinedCapture
from data_sender import DataSender
from peripherals import LEDController, ResetButton


class SonoCardia:
    """
    Automatic dual-core SONOCARDIA controller.

    Records PCG (Core 1) and ECG (Core 0) simultaneously so both
    signals are perfectly time-aligned (in-phase). Runs in a
    continuous loop without any button interaction.
    """

    def __init__(self):
        print("=" * 50)
        print("  SONOCARDIA - Heart Health Monitor")
        print("  AI-Powered | Dual-Core | Auto Mode")
        print("=" * 50)

        self.leds = LEDController()
        self.wifi = WiFiManager()
        self.capture = CombinedCapture()
        self.sender = DataSender(self.wifi)
        self.reset_btn = ResetButton()
        self._running = False
        self._cycle = 0

    # ─────────────────────────────────────────────────────────
    # Startup
    # ─────────────────────────────────────────────────────────
    def startup(self):
        """
        Boot sequence:
            1. Test MAX9814 mic + AD8232 ECG hardware
            2. Connect to Wi-Fi
            3. Ping the Flask server
        """
        print("\n[System] Starting up...")
        self.leds.all_off()

        # ── Step 1: Hardware check ──
        print("\n[System] Step 1: Testing hardware...")
        mic_ok, ecg_ok = self.capture.test_hardware()

        if not mic_ok:
            print("[System] WARNING: MAX9814 microphone not detected!")
            self.leds.blink_error(3)
        if not ecg_ok:
            print("[System] WARNING: AD8232 ECG module not detected!")
            self.leds.blink_error(3)

        # ── Step 2: Wi-Fi ──
        print("\n[System] Step 2: Connecting to Wi-Fi...")
        for _ in range(5):
            self.leds.show_wifi_connecting()

        ip = self.wifi.connect(timeout=20)
        if ip:
            print(f"[System] Wi-Fi connected: {ip}")
        else:
            print("[System] WARNING: Wi-Fi connection failed!")
            self.leds.show_error()

        # ── Step 3: Server check ──
        print("\n[System] Step 3: Checking Flask server...")
        if self.wifi.is_connected():
            if self.sender.ping_server():
                print("[System] Flask server is reachable!")
            else:
                print("[System] WARNING: Flask server not reachable!")
                self.leds.blink_error(2)

        # ── Step 4: Enable runtime reset button ──
        self.reset_btn.enable_runtime_reset()

        # ── Ready ──
        print("\n[System] Startup complete!")
        print("[System] Entering automatic recording mode.")
        print(f"[System] Cycle interval: {CYCLE_DELAY_SECONDS}s")
        print("[System] Press GPIO0 button to reboot.")
        self.leds.show_ready()

        gc.collect()
        if DEBUG:
            print(f"[System] Free memory: {gc.mem_free()} bytes")

    # ─────────────────────────────────────────────────────────
    # Single recording cycle
    # ─────────────────────────────────────────────────────────
    def run_cycle(self):
        """
        One full measurement cycle:
            1. Wait for ECG leads
            2. Countdown
            3. Simultaneous PCG + ECG recording (dual-core, in-phase)
            4. Send PCG to server → display result
            5. Send ECG to server → display result
        """
        self._cycle += 1
        print("\n" + "=" * 50)
        print(f"  RECORDING CYCLE #{self._cycle}")
        print("=" * 50)

        # ── Wait for ECG leads ──
        print("\n[System] Attach ECG electrodes (RA, LA, RL)")
        print("[System] Place stethoscope on chest")
        if not self.capture.wait_for_leads(timeout=LEADS_WAIT_TIMEOUT):
            print("[System] ECG leads not connected — skipping cycle.")
            self.leds.blink_error(5)
            return False

        # ── Countdown ──
        print(f"\n[System] Recording starts in {RECORD_COUNTDOWN}s — stay still!")
        for i in range(RECORD_COUNTDOWN, 0, -1):
            print(f"  {i}...")
            self.leds.show_sending()  # blink during countdown
            time.sleep(1)

        # ── Simultaneous recording ──
        self.leds.show_recording()
        print("\n[System] RECORDING NOW (PCG + ECG simultaneously)...")

        pcg_rec, ecg_rec = self.capture.record_simultaneous()

        self.leds.stop_recording()

        if pcg_rec is None or ecg_rec is None:
            print("[System] Recording failed!")
            self.leds.show_error()
            return False

        print(f"\n[System] PCG: {pcg_rec['num_samples']} samples "
              f"(actual {pcg_rec['actual_sample_rate']} Hz)")
        print(f"[System] ECG: {ecg_rec['num_samples']} samples "
              f"(actual {ecg_rec['actual_sample_rate']} Hz, "
              f"quality: {ecg_rec['quality']})")

        gc.collect()

        # ── Send PCG to server ──
        print("\n[System] Sending PCG (heart sound) to server...")
        for _ in range(3):
            self.leds.show_sending()

        pcg_result = self.sender.send_pcg(pcg_rec)

        # Free the large sample list from memory
        pcg_rec = None
        gc.collect()

        if "error" in pcg_result:
            print(f"[PCG] Server error: {pcg_result['error']}")
            self.leds.show_error()
        else:
            self._display_pcg_result(pcg_result)

        # ── Send ECG to server ──
        print("\n[System] Sending ECG to server...")
        for _ in range(3):
            self.leds.show_sending()

        ecg_result = self.sender.send_ecg(ecg_rec)

        ecg_rec = None
        gc.collect()

        if "error" in ecg_result:
            print(f"[ECG] Server error: {ecg_result['error']}")
            self.leds.show_error()
        else:
            self._display_ecg_result(ecg_result)

        self.leds.show_success()
        return True

    # ─────────────────────────────────────────────────────────
    # Display helpers
    # ─────────────────────────────────────────────────────────
    def _display_pcg_result(self, result):
        """Display heart sound classification result."""
        classification = result.get("classification", "Unknown")
        confidence = result.get("confidence", 0)

        print("\n" + "-" * 40)
        print("  HEART SOUND ANALYSIS RESULT")
        print("-" * 40)
        print(f"  Classification: {classification}")
        print(f"  Confidence:     {confidence:.1%}")

        if classification == "Murmur":
            severity = result.get("severity", {})
            print("\n  Murmur Severity Details:")
            print(f"    Location:  {severity.get('location', 'N/A')}")
            print(f"    Timing:    {severity.get('timing', 'N/A')}")
            print(f"    Shape:     {severity.get('shape', 'N/A')}")
            print(f"    Grading:   {severity.get('grading', 'N/A')}")
            print(f"    Pitch:     {severity.get('pitch', 'N/A')}")
            print(f"    Quality:   {severity.get('quality', 'N/A')}")
            print("\n  WARNING: Murmur detected — consult a cardiologist!")
        elif classification == "Normal":
            print("  Heart sounds appear normal.")
        elif classification == "Artifact":
            print("  Recording has artifacts. Will retry next cycle.")

    def _display_ecg_result(self, result):
        """Display ECG prediction result."""
        prediction = result.get("prediction", "Unknown")
        confidence = result.get("confidence", 0)
        risk = result.get("risk_level", "Unknown")

        print("\n" + "-" * 40)
        print("  ECG ANALYSIS RESULT")
        print("-" * 40)
        print(f"  Prediction:  {prediction}")
        print(f"  Confidence:  {confidence:.1%}")
        print(f"  Beat Class:  {result.get('beat_class', 'N/A')}")
        print(f"  Risk Level:  {risk}")

        if prediction != "Normal":
            print(f"\n  WARNING: Abnormality detected ({prediction})")
            print("  Please consult a cardiologist!")
        else:
            print("  ECG appears normal.")

    # ─────────────────────────────────────────────────────────
    # Main loop
    # ─────────────────────────────────────────────────────────
    def run(self):
        """
        Automatic main loop — no buttons needed.

        Repeats: record → send → display → wait → record ...
        Press Ctrl+C in the REPL to stop.
        """
        self.startup()
        self._running = True

        print("\n[System] Entering automatic loop...\n")

        while self._running:
            try:
                # Ensure Wi-Fi before each cycle
                if not self.wifi.is_connected():
                    print("[System] Wi-Fi lost, reconnecting...")
                    self.wifi.reconnect()

                self.run_cycle()

                # Wait before next cycle
                gc.collect()
                if DEBUG:
                    print(f"\n[System] Free memory: {gc.mem_free()} bytes")

                print(f"\n[System] Next cycle in {CYCLE_DELAY_SECONDS}s...")
                self.leds.show_ready()
                time.sleep(CYCLE_DELAY_SECONDS)

            except KeyboardInterrupt:
                print("\n[System] Stopped by user (Ctrl+C).")
                self._running = False

            except Exception as e:
                print(f"[System] Error: {e}")
                self.leds.show_error()
                time.sleep(5)
                self.leds.show_ready()

        self.shutdown()

    def shutdown(self):
        """Clean shutdown."""
        print("\n[System] Shutting down...")
        self._running = False
        self.leds.all_off()
        self.wifi.disconnect()
        print("[System] Goodbye!")


# ============================================================
# Entry point — runs automatically on boot
# ============================================================
# Read operating mode from config.json (falls back to config.py default)
try:
    import json as _json
    with open("config.json", "r") as _f:
        _runtime_cfg = _json.load(_f)
except Exception:
    _runtime_cfg = {}

from config import MODE as _DEFAULT_MODE
MODE = _runtime_cfg.get("mode", _DEFAULT_MODE)


def main():
    # Enable runtime reset button (GPIO0) for all modes
    reset_btn = ResetButton()
    reset_btn.enable_runtime_reset()

    if MODE == "websocket":
        # ── WebSocket streaming mode (for Flutter app) ──
        from websocket_server import WebSocketServer

        # boot.py already connected Wi-Fi; just verify
        wifi = WiFiManager()
        if not wifi.is_connected():
            print("[System] Wi-Fi not ready, connecting...")
            ip = wifi.connect(timeout=15)
            if not ip:
                print("[System] Wi-Fi FAILED — cannot start server.")
                return
            print(f"[System] Wi-Fi connected: {ip}")

        print("[System] Press GPIO0 button to reboot.")

        # Light the server LED while WS is running
        wifi.set_server_led(True)

        ws = WebSocketServer()
        try:
            ws.start()
        except KeyboardInterrupt:
            ws.stop()
            wifi.set_server_led(False)
            print("[System] Server stopped.")
    else:
        # ── Original auto-recording mode ──
        app = SonoCardia()
        app.run()


if __name__ == "__main__":
    main()
