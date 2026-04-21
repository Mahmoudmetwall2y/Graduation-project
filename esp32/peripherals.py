# ============================================================
# SONOCARDIA - LED & Button Controller
# Manages LED indicators and button input for user interaction
# ============================================================

import machine
import time
from config import (
    LED_STATUS_PIN,
    LED_RECORDING_PIN,
    LED_RECORDING_INVERT,
    LED_ERROR_PIN,
    BTN_START_PCG_PIN,
    BTN_START_ECG_PIN,
    BTN_RESET_PIN,
    BTN_RESET_DEBOUNCE_MS,
    DEBUG,
)


class LEDController:
    """Controls LED indicators for system status feedback."""

    def __init__(self):
        self.status_led = machine.Pin(LED_STATUS_PIN, machine.Pin.OUT)
        self.recording_led = machine.Signal(
            machine.Pin(LED_RECORDING_PIN, machine.Pin.OUT), invert=LED_RECORDING_INVERT
        )
        self.error_led = machine.Pin(LED_ERROR_PIN, machine.Pin.OUT)
        self.all_off()

    def all_off(self):
        """Turn off all LEDs."""
        self.status_led.off()
        self.recording_led.off()
        self.error_led.off()

    def show_ready(self):
        """Solid status LED = system ready."""
        self.status_led.on()
        self.recording_led.off()
        self.error_led.off()

    def show_recording(self):
        """Recording LED on during capture."""
        self.recording_led.on()

    def stop_recording(self):
        """Turn off recording LED."""
        self.recording_led.off()

    def show_error(self):
        """Error LED on."""
        self.error_led.on()
        self.status_led.off()

    def clear_error(self):
        """Turn off error LED."""
        self.error_led.off()

    def show_sending(self):
        """Blink status LED while sending data."""
        self.status_led.on()
        time.sleep_ms(100)
        self.status_led.off()
        time.sleep_ms(100)

    def show_success(self):
        """Quick triple blink on status LED for success."""
        for _ in range(3):
            self.status_led.on()
            time.sleep_ms(150)
            self.status_led.off()
            time.sleep_ms(150)
        self.status_led.on()

    def show_wifi_connecting(self):
        """Slow blink while connecting to Wi-Fi."""
        self.status_led.on()
        time.sleep_ms(300)
        self.status_led.off()
        time.sleep_ms(300)

    def blink_error(self, count=5):
        """Blink error LED a number of times."""
        for _ in range(count):
            self.error_led.on()
            time.sleep_ms(200)
            self.error_led.off()
            time.sleep_ms(200)


class ButtonController:
    """Handles button presses with debouncing for PCG/ECG triggers."""

    def __init__(self):
        self.btn_pcg = machine.Pin(BTN_START_PCG_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
        self.btn_ecg = machine.Pin(BTN_START_ECG_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
        
        self._pcg_callback = None
        self._ecg_callback = None
        self._last_pcg_press = 0
        self._last_ecg_press = 0
        self._debounce_ms = 300

    def on_pcg_press(self, callback):
        """
        Register callback for PCG button press.
        
        Args:
            callback: Function to call when PCG button is pressed.
        """
        self._pcg_callback = callback
        self.btn_pcg.irq(trigger=machine.Pin.IRQ_FALLING, handler=self._handle_pcg)

    def on_ecg_press(self, callback):
        """
        Register callback for ECG button press.
        
        Args:
            callback: Function to call when ECG button is pressed.
        """
        self._ecg_callback = callback
        self.btn_ecg.irq(trigger=machine.Pin.IRQ_FALLING, handler=self._handle_ecg)

    def _handle_pcg(self, pin):
        """Internal handler for PCG button with debouncing."""
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last_pcg_press) > self._debounce_ms:
            self._last_pcg_press = now
            if self._pcg_callback:
                self._pcg_callback()

    def _handle_ecg(self, pin):
        """Internal handler for ECG button with debouncing."""
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last_ecg_press) > self._debounce_ms:
            self._last_ecg_press = now
            if self._ecg_callback:
                self._ecg_callback()

    def is_pcg_pressed(self):
        """Poll check if PCG button is currently pressed (active LOW)."""
        return self.btn_pcg.value() == 0

    def is_ecg_pressed(self):
        """Poll check if ECG button is currently pressed (active LOW)."""
        return self.btn_ecg.value() == 0

    def wait_for_any_button(self, timeout=None):
        """
        Block until either button is pressed.
        
        Args:
            timeout: Optional timeout in seconds.
        
        Returns:
            str: "pcg", "ecg", or None if timeout.
        """
        start = time.time()
        while True:
            if self.is_pcg_pressed():
                time.sleep_ms(self._debounce_ms)
                return "pcg"
            if self.is_ecg_pressed():
                time.sleep_ms(self._debounce_ms)
                return "ecg"
            if timeout and (time.time() - start) > timeout:
                return None
            time.sleep_ms(50)


class ResetButton:
    """
    Multi-function boot/reset button on GPIO0.

    Boot-time check (polled):
        Call is_held_at_boot() right after power-on.  If the button
        was held during boot → returns True → caller should enter AP
        setup mode.

    Runtime reset (IRQ-driven):
        Call enable_runtime_reset() once during normal operation.
        A press triggers machine.reset() after debounce validation.
    """

    def __init__(self):
        self._pin = machine.Pin(BTN_RESET_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
        self._last_press = 0
        self._irq_attached = False

    # ── Boot-time check (polled, no IRQ) ──

    def is_held_at_boot(self, hold_ms=1000):
        """
        Check whether the button is being held down during boot.

        Reads the pin state immediately, then confirms it is still
        held after *hold_ms* milliseconds to avoid false triggers
        from electrical noise at power-on.

        Returns True if the button was held for the full duration.
        """
        if self._pin.value() != 0:
            return False

        # Confirm — button must stay pressed for hold_ms
        start = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), start) < hold_ms:
            if self._pin.value() != 0:
                return False
            time.sleep_ms(20)

        if DEBUG:
            print("[ResetBtn] Button held at boot — entering setup mode")
        return True

    # ── Runtime reset (IRQ-driven) ──

    def enable_runtime_reset(self):
        """
        Attach a falling-edge IRQ to the button.

        When pressed during normal operation, the handler verifies
        the press is genuine (debounce + pin re-read), blinks the
        error LED briefly as a visual cue, then calls
        machine.reset().
        """
        if self._irq_attached:
            return
        self._pin.irq(trigger=machine.Pin.IRQ_FALLING, handler=self._handle_reset)
        self._irq_attached = True
        if DEBUG:
            print("[ResetBtn] Runtime reset IRQ enabled")

    def disable_runtime_reset(self):
        """Detach the IRQ (e.g. before recording)."""
        self._pin.irq(handler=None)
        self._irq_attached = False

    def _handle_reset(self, pin):
        """
        ISR for the reset button.

        Debounce logic:
            1. Reject if last press was < BTN_RESET_DEBOUNCE_MS ago.
            2. Wait 50 ms, then re-read the pin to confirm it is
               still LOW (genuine press, not noise).
            3. Blink error LED 3× as a visual warning, then reset.
        """
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last_press) < BTN_RESET_DEBOUNCE_MS:
            return
        self._last_press = now

        # Small delay + re-read inside ISR-safe window
        time.sleep_ms(50)
        if pin.value() != 0:
            return  # noise / bounce

        print("[ResetBtn] Reset button pressed — rebooting...")

        # Quick visual feedback (non-blocking blinks)
        try:
            err_led = machine.Pin(LED_ERROR_PIN, machine.Pin.OUT)
            for _ in range(3):
                err_led.on()
                time.sleep_ms(80)
                err_led.off()
                time.sleep_ms(80)
        except Exception:
            pass

        machine.reset()
