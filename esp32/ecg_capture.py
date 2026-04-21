# ============================================================
# SONOCARDIA - AD8232 ECG Signal Capture Module
# Captures electrocardiogram data via ADC from AD8232
# ============================================================

import machine
import time
import array
from config import (
    ECG_PIN,
    ECG_LO_PLUS_PIN,
    ECG_LO_MINUS_PIN,
    ECG_SAMPLE_RATE,
    ECG_RECORD_DURATION,
    MIC_BITS,
    DEBUG,
)

# Overlay from config.json if available
try:
    import json as _json
    with open("config.json", "r") as _f:
        _cfg = _json.load(_f)
    ECG_SAMPLE_RATE    = _cfg.get("sample_rate",  ECG_SAMPLE_RATE)
    ECG_RECORD_DURATION = _cfg.get("ecg_duration", ECG_RECORD_DURATION)
except Exception:
    pass


class ECGCapture:
    """
    Captures ECG signals from AD8232 heart rate monitor module
    via ESP32 ADC.
    
    The AD8232 has leads-off detection pins (LO+ and LO-) that
    go HIGH when electrodes are not properly connected.
    
    Wiring:
        AD8232 3.3V   -> ESP32 3.3V
        AD8232 GND    -> ESP32 GND
        AD8232 OUTPUT -> ESP32 GPIO35 (ADC1_CH7)
        AD8232 LO+    -> ESP32 GPIO32
        AD8232 LO-    -> ESP32 GPIO33
        AD8232 SDN    -> Not connected (or 3.3V to keep active)
        
    Electrodes:
        RA (Right Arm)  -> Right wrist/chest
        LA (Left Arm)   -> Left wrist/chest
        RL (Right Leg)  -> Right ankle/lower abdomen (reference)
    """

    def __init__(self):
        # Configure ADC on ECG output pin
        self.adc = machine.ADC(machine.Pin(ECG_PIN))
        self.adc.atten(machine.ADC.ATTN_11DB)
        self.adc.width(machine.ADC.WIDTH_12BIT)

        # Configure leads-off detection pins as digital inputs
        self.lo_plus = machine.Pin(ECG_LO_PLUS_PIN, machine.Pin.IN)
        self.lo_minus = machine.Pin(ECG_LO_MINUS_PIN, machine.Pin.IN)

        self.sample_rate = ECG_SAMPLE_RATE
        self.duration = ECG_RECORD_DURATION
        self.total_samples = self.sample_rate * self.duration
        self.is_recording = False

        if DEBUG:
            print(f"[ECG] Initialized on GPIO{ECG_PIN}")
            print(f"[ECG] LO+ on GPIO{ECG_LO_PLUS_PIN}, LO- on GPIO{ECG_LO_MINUS_PIN}")
            print(f"[ECG] Sample rate: {self.sample_rate} Hz")
            print(f"[ECG] Duration: {self.duration}s")
            print(f"[ECG] Total samples: {self.total_samples}")

    def check_leads(self):
        """
        Check if ECG electrodes are properly connected.
        AD8232 LO+ and LO- go HIGH when leads are off.
        
        Returns:
            dict: Status of each lead connection.
        """
        lo_plus_val = self.lo_plus.value()
        lo_minus_val = self.lo_minus.value()

        leads_ok = (lo_plus_val == 0) and (lo_minus_val == 0)

        status = {
            "leads_connected": leads_ok,
            "lo_plus": "OFF" if lo_plus_val else "OK",
            "lo_minus": "OFF" if lo_minus_val else "OK",
        }

        if DEBUG:
            if leads_ok:
                print("[ECG] All leads connected properly.")
            else:
                print(f"[ECG] LEADS OFF! LO+: {status['lo_plus']}, LO-: {status['lo_minus']}")
                print("[ECG] Please check electrode placement.")

        return status

    def wait_for_leads(self, timeout=30):
        """
        Wait until all ECG leads are properly connected.
        
        Args:
            timeout: Max seconds to wait.
        
        Returns:
            bool: True if leads connected within timeout.
        """
        if DEBUG:
            print("[ECG] Waiting for leads to be connected...")

        start = time.time()
        while time.time() - start < timeout:
            if self.check_leads()["leads_connected"]:
                if DEBUG:
                    print("[ECG] Leads connected!")
                return True
            time.sleep(0.5)

        if DEBUG:
            print("[ECG] Timeout waiting for leads.")
        return False

    def record(self, callback=None, check_leads_during=True):
        """
        Record ECG signal data from AD8232.
        
        Uses a timed loop to maintain consistent sampling rate
        matching MIT-BIH standard (360 Hz).
        
        Args:
            callback: Optional function called with progress (0.0 to 1.0).
            check_leads_during: Check leads-off during recording.
        
        Returns:
            dict: Recording data with samples, metadata, and lead status.
        """
        if self.is_recording:
            if DEBUG:
                print("[ECG] Already recording!")
            return None

        # Check leads before starting
        lead_status = self.check_leads()
        if not lead_status["leads_connected"]:
            if DEBUG:
                print("[ECG] Cannot record: leads not connected!")
            return {"error": "leads_not_connected", "status": lead_status}

        self.is_recording = True

        # Pre-allocate array for samples
        samples = array.array('H', (0 for _ in range(self.total_samples)))
        
        # Track leads-off events during recording
        leads_off_count = 0
        leads_off_indices = []

        # Calculate sampling interval in microseconds
        sample_interval_us = 1_000_000 // self.sample_rate

        if DEBUG:
            print(f"[ECG] Recording started ({self.duration}s)...")
            print(f"[ECG] Sample interval: {sample_interval_us} us")

        start_time = time.ticks_us()

        for i in range(self.total_samples):
            # Check leads-off detection (optional, adds slight overhead)
            if check_leads_during and (i % (self.sample_rate // 2) == 0):
                if self.lo_plus.value() or self.lo_minus.value():
                    leads_off_count += 1
                    leads_off_indices.append(i)

            # Read ADC value
            samples[i] = self.adc.read()

            # Progress callback every 10%
            if callback and i % (self.total_samples // 10) == 0:
                progress = i / self.total_samples
                callback(progress)

            # Maintain consistent sampling rate
            target_time = start_time + (i + 1) * sample_interval_us
            while time.ticks_us() < target_time:
                pass

        elapsed_us = time.ticks_diff(time.ticks_us(), start_time)
        actual_rate = self.total_samples / (elapsed_us / 1_000_000)

        self.is_recording = False

        if DEBUG:
            print(f"[ECG] Recording complete.")
            print(f"[ECG] Actual sample rate: {actual_rate:.1f} Hz")
            print(f"[ECG] Samples collected: {len(samples)}")
            print(f"[ECG] Leads-off events: {leads_off_count}")
            print(f"[ECG] Min: {min(samples)}, Max: {max(samples)}")

        return {
            "type": "ecg",
            "samples": list(samples),
            "sample_rate": self.sample_rate,
            "actual_sample_rate": round(actual_rate, 1),
            "duration": self.duration,
            "num_samples": len(samples),
            "adc_bits": MIC_BITS,
            "adc_max": (2 ** MIC_BITS) - 1,
            "leads_off_events": leads_off_count,
            "leads_off_indices": leads_off_indices,
            "quality": "good" if leads_off_count == 0 else "degraded",
        }

    def read_single(self):
        """Read a single ADC value from the ECG module."""
        if self.lo_plus.value() or self.lo_minus.value():
            return None  # Leads off
        return self.adc.read()

    def stream_to_serial(self, duration=10):
        """
        Stream ECG data to serial console for debugging/visualization.
        Can be used with serial plotters.
        
        Args:
            duration: Streaming duration in seconds.
        """
        if DEBUG:
            print(f"[ECG] Streaming to serial for {duration}s...")

        sample_interval_us = 1_000_000 // self.sample_rate
        total = self.sample_rate * duration

        start_time = time.ticks_us()
        for i in range(total):
            if self.lo_plus.value() or self.lo_minus.value():
                print("!")  # Leads off marker
            else:
                print(self.adc.read())

            target_time = start_time + (i + 1) * sample_interval_us
            while time.ticks_us() < target_time:
                pass

        if DEBUG:
            print("[ECG] Streaming complete.")

    def detect_heartbeat(self, threshold=2500, window=50):
        """
        Simple real-time heartbeat detection using threshold crossing.
        Useful for basic heart rate estimation.
        
        Args:
            threshold: ADC value threshold for R-peak detection.
            window: Number of samples between allowed peaks.
        
        Returns:
            int: Estimated BPM over ~10 seconds.
        """
        if DEBUG:
            print("[ECG] Detecting heartbeat...")

        peaks = 0
        last_peak = 0
        measure_duration = 10  # seconds
        total_samples = self.sample_rate * measure_duration
        sample_interval_us = 1_000_000 // self.sample_rate

        start_time = time.ticks_us()
        for i in range(total_samples):
            val = self.adc.read()

            if val > threshold and (i - last_peak) > window:
                peaks += 1
                last_peak = i

            target_time = start_time + (i + 1) * sample_interval_us
            while time.ticks_us() < target_time:
                pass

        bpm = peaks * (60 // measure_duration)

        if DEBUG:
            print(f"[ECG] Detected {peaks} peaks in {measure_duration}s")
            print(f"[ECG] Estimated BPM: {bpm}")

        return bpm

    def test_connection(self):
        """
        Test if AD8232 is connected and responding.
        
        Returns:
            bool: True if module appears connected.
        """
        readings = []
        for _ in range(100):
            readings.append(self.adc.read())
            time.sleep_ms(5)

        min_val = min(readings)
        max_val = max(readings)
        spread = max_val - min_val

        connected = spread > 10

        if DEBUG:
            print(f"[ECG] Connection test: min={min_val}, max={max_val}, spread={spread}")
            print(f"[ECG] Module {'connected' if connected else 'NOT detected'}")

        return connected
