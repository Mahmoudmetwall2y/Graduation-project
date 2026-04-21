# ============================================================
# SONOCARDIA - MAX9814 Heart Sound (PCG) Capture Module
# Captures phonocardiogram data via ADC from MAX9814 mic
# ============================================================

import machine
import time
import array
from config import (
    MIC_PIN,
    MIC_SAMPLE_RATE,
    MIC_RECORD_DURATION,
    MIC_BITS,
    DEBUG,
)

# Overlay from config.json if available
try:
    import json as _json
    with open("config.json", "r") as _f:
        _cfg = _json.load(_f)
    MIC_SAMPLE_RATE     = _cfg.get("pcg_sample_rate", MIC_SAMPLE_RATE)
    MIC_RECORD_DURATION = _cfg.get("record_duration", MIC_RECORD_DURATION)
except Exception:
    pass


class HeartSoundCapture:
    """
    Captures heart sound (PCG) signals from MAX9814 microphone
    via ESP32 ADC. The MAX9814 outputs an analog signal that
    represents the amplified heart sound waveform.
    
    Wiring:
        MAX9814 VDD  -> ESP32 3.3V
        MAX9814 GND  -> ESP32 GND
        MAX9814 OUT  -> ESP32 GPIO34 (ADC1_CH6)
        MAX9814 GAIN -> Leave floating (60dB) or connect to GND (50dB) / VDD (40dB)
    """

    def __init__(self):
        # Configure ADC on the microphone pin
        self.adc = machine.ADC(machine.Pin(MIC_PIN))
        
        # Set ADC attenuation to 11dB for full 0-3.3V range
        self.adc.atten(machine.ADC.ATTN_11DB)
        
        # Set ADC width to 12-bit (0-4095)
        self.adc.width(machine.ADC.WIDTH_12BIT)
        
        self.sample_rate = MIC_SAMPLE_RATE
        self.duration = MIC_RECORD_DURATION
        self.total_samples = self.sample_rate * self.duration
        self.is_recording = False

        if DEBUG:
            print(f"[PCG] Initialized on GPIO{MIC_PIN}")
            print(f"[PCG] Sample rate: {self.sample_rate} Hz")
            print(f"[PCG] Duration: {self.duration}s")
            print(f"[PCG] Total samples: {self.total_samples}")

    def calibrate(self, num_samples=500):
        """
        Calibrate the baseline (DC offset) of the microphone signal.
        Should be called in a quiet environment before recording.
        
        Returns:
            int: The DC offset value (baseline).
        """
        if DEBUG:
            print("[PCG] Calibrating baseline...")

        total = 0
        for _ in range(num_samples):
            total += self.adc.read()
            time.sleep_us(100)

        baseline = total // num_samples
        if DEBUG:
            print(f"[PCG] Baseline (DC offset): {baseline}")
        return baseline

    def record(self, callback=None):
        """
        Record heart sound data from MAX9814 microphone.
        
        Uses a timed loop to maintain consistent sampling rate.
        Stores samples in a pre-allocated array for memory efficiency.
        
        Args:
            callback: Optional function called with progress (0.0 to 1.0).
        
        Returns:
            dict: Recording data with samples, metadata.
        """
        if self.is_recording:
            if DEBUG:
                print("[PCG] Already recording!")
            return None

        self.is_recording = True
        
        # Pre-allocate array for samples (unsigned short = 'H')
        samples = array.array('H', (0 for _ in range(self.total_samples)))
        
        # Calculate sampling interval in microseconds
        sample_interval_us = 1_000_000 // self.sample_rate

        if DEBUG:
            print(f"[PCG] Recording started ({self.duration}s)...")
            print(f"[PCG] Sample interval: {sample_interval_us} us")

        start_time = time.ticks_us()
        
        for i in range(self.total_samples):
            # Read ADC value (0-4095 for 12-bit)
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
            print(f"[PCG] Recording complete.")
            print(f"[PCG] Actual sample rate: {actual_rate:.1f} Hz")
            print(f"[PCG] Samples collected: {len(samples)}")
            print(f"[PCG] Min: {min(samples)}, Max: {max(samples)}")

        return {
            "type": "pcg",
            "samples": list(samples),
            "sample_rate": self.sample_rate,
            "actual_sample_rate": round(actual_rate, 1),
            "duration": self.duration,
            "num_samples": len(samples),
            "adc_bits": MIC_BITS,
            "adc_max": (2 ** MIC_BITS) - 1,
        }

    def read_single(self):
        """Read a single ADC value from the microphone."""
        return self.adc.read()

    def read_rms(self, num_samples=200):
        """
        Calculate RMS (root mean square) of the signal.
        Useful for checking if heart sounds are being detected.
        
        Returns:
            float: RMS value of the signal.
        """
        baseline = 2048  # Mid-point for 12-bit ADC
        sum_sq = 0
        for _ in range(num_samples):
            val = self.adc.read() - baseline
            sum_sq += val * val
            time.sleep_us(250)
        
        rms = (sum_sq / num_samples) ** 0.5
        return rms

    def is_signal_present(self, threshold=100):
        """
        Check if a meaningful heart sound signal is present.
        
        Args:
            threshold: Minimum RMS value to consider signal present.
        
        Returns:
            bool: True if signal is above threshold.
        """
        rms = self.read_rms()
        if DEBUG:
            print(f"[PCG] Signal RMS: {rms:.1f} (threshold: {threshold})")
        return rms > threshold

    def test_connection(self):
        """
        Test if MAX9814 is connected and responding.
        Reads several samples and checks if they vary.
        
        Returns:
            bool: True if microphone appears connected.
        """
        readings = []
        for _ in range(50):
            readings.append(self.adc.read())
            time.sleep_ms(10)
        
        min_val = min(readings)
        max_val = max(readings)
        spread = max_val - min_val
        
        # If spread is very small, mic might not be connected
        # (reading only noise from floating pin vs. actual signal)
        connected = spread > 20
        
        if DEBUG:
            print(f"[PCG] Connection test: min={min_val}, max={max_val}, spread={spread}")
            print(f"[PCG] Microphone {'connected' if connected else 'NOT detected'}")
        
        return connected
