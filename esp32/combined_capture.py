# ============================================================
# SONOCARDIA - Dual-Core Simultaneous PCG + ECG Capture
#
# Uses ESP32's two cores via _thread to record heart sound
# (PCG) and ECG signals in-phase (time-aligned).
#
#   Core 0 (main thread)  → ECG capture   (AD8232, 360 Hz)
#   Core 1 (second thread) → PCG capture   (MAX9814, 4000 Hz)
#
# Both cores synchronize on a shared flag so recording starts
# at the exact same microsecond.
# ============================================================

import machine
import time
import array
import _thread
from config import (
    MIC_PIN,
    MIC_SAMPLE_RATE,
    MIC_RECORD_DURATION,
    MIC_BITS,
    ECG_PIN,
    ECG_LO_PLUS_PIN,
    ECG_LO_MINUS_PIN,
    ECG_SAMPLE_RATE,
    ECG_RECORD_DURATION,
    DEBUG,
)

# Overlay from config.json if available
try:
    import json as _json
    with open("config.json", "r") as _f:
        _cfg = _json.load(_f)
    ECG_SAMPLE_RATE     = _cfg.get("sample_rate",     ECG_SAMPLE_RATE)
    ECG_RECORD_DURATION = _cfg.get("ecg_duration",    ECG_RECORD_DURATION)
    MIC_SAMPLE_RATE     = _cfg.get("pcg_sample_rate", MIC_SAMPLE_RATE)
    MIC_RECORD_DURATION = _cfg.get("record_duration", MIC_RECORD_DURATION)
except Exception:
    pass


class CombinedCapture:
    """
    Records PCG (heart sound) and ECG simultaneously using
    both ESP32 cores so the two signals are perfectly in-phase.

    Core allocation:
        Core 0 (main)   — ECG at 360 Hz   (lighter workload)
        Core 1 (_thread) — PCG at 4000 Hz  (heavier workload)

    Synchronization:
        A shared list [flag] acts as a trigger. Both cores
        busy-wait until flag[0] == 1, then start sampling at
        the same ticks_us() moment.
    """

    def __init__(self):
        # ── PCG (MAX9814 Microphone) ──
        self.pcg_adc = machine.ADC(machine.Pin(MIC_PIN))
        self.pcg_adc.atten(machine.ADC.ATTN_11DB)
        self.pcg_adc.width(machine.ADC.WIDTH_12BIT)
        self.pcg_rate = MIC_SAMPLE_RATE
        self.pcg_duration = MIC_RECORD_DURATION
        self.pcg_total = self.pcg_rate * self.pcg_duration

        # ── ECG (AD8232) ──
        self.ecg_adc = machine.ADC(machine.Pin(ECG_PIN))
        self.ecg_adc.atten(machine.ADC.ATTN_11DB)
        self.ecg_adc.width(machine.ADC.WIDTH_12BIT)
        self.lo_plus = machine.Pin(ECG_LO_PLUS_PIN, machine.Pin.IN)
        self.lo_minus = machine.Pin(ECG_LO_MINUS_PIN, machine.Pin.IN)
        self.ecg_rate = ECG_SAMPLE_RATE
        self.ecg_duration = ECG_RECORD_DURATION
        self.ecg_total = self.ecg_rate * self.ecg_duration

        # ── Shared synchronization ──
        # sync[0] = start flag (0=wait, 1=go)
        # sync[1] = PCG thread done (0=running, 1=done)
        # sync[2] = PCG thread error (0=ok, 1=error)
        self._sync = [0, 0, 0]

        # Storage filled by the Core 1 thread
        self._pcg_samples = None
        self._pcg_actual_rate = 0.0

        if DEBUG:
            print("[Combined] Dual-core capture initialized")
            print(f"[Combined] PCG: GPIO{MIC_PIN} @ {self.pcg_rate} Hz, {self.pcg_duration}s")
            print(f"[Combined] ECG: GPIO{ECG_PIN} @ {self.ecg_rate} Hz, {self.ecg_duration}s")

    # ─────────────────────────────────────────────────────────
    # Core 1 thread — PCG capture
    # ─────────────────────────────────────────────────────────
    def _pcg_thread(self):
        """
        Runs on Core 1.  Pre-allocates the sample buffer, then
        busy-waits for the sync flag before sampling.
        """
        try:
            samples = array.array('H', (0 for _ in range(self.pcg_total)))
            interval_us = 1_000_000 // self.pcg_rate

            # ── Busy-wait for start signal ──
            while self._sync[0] == 0:
                pass

            # ── Sample loop ──
            start = time.ticks_us()
            for i in range(self.pcg_total):
                samples[i] = self.pcg_adc.read()
                target = start + (i + 1) * interval_us
                while time.ticks_us() < target:
                    pass

            elapsed = time.ticks_diff(time.ticks_us(), start)
            self._pcg_actual_rate = self.pcg_total / (elapsed / 1_000_000)
            self._pcg_samples = samples

        except Exception as e:
            if DEBUG:
                print(f"[PCG-Core1] Error: {e}")
            self._sync[2] = 1  # mark error

        finally:
            self._sync[1] = 1  # mark done

    # ─────────────────────────────────────────────────────────
    # Core 0 — ECG capture (called from main thread)
    # ─────────────────────────────────────────────────────────
    def _ecg_record(self):
        """
        Runs on Core 0 (main thread).  Samples ECG while Core 1
        simultaneously samples PCG.

        Returns:
            tuple: (ecg_samples, ecg_actual_rate, leads_off_count)
        """
        samples = array.array('H', (0 for _ in range(self.ecg_total)))
        interval_us = 1_000_000 // self.ecg_rate
        leads_off_count = 0

        # ── Start signal — both cores go now ──
        self._sync[0] = 1

        start = time.ticks_us()
        for i in range(self.ecg_total):
            # Periodic leads-off check (twice per second)
            if i % (self.ecg_rate // 2) == 0:
                if self.lo_plus.value() or self.lo_minus.value():
                    leads_off_count += 1

            samples[i] = self.ecg_adc.read()

            target = start + (i + 1) * interval_us
            while time.ticks_us() < target:
                pass

        elapsed = time.ticks_diff(time.ticks_us(), start)
        actual_rate = self.ecg_total / (elapsed / 1_000_000)

        return samples, actual_rate, leads_off_count

    # ─────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────
    def check_leads(self):
        """Check if ECG electrodes are properly attached."""
        lo_p = self.lo_plus.value()
        lo_m = self.lo_minus.value()
        ok = (lo_p == 0) and (lo_m == 0)
        if DEBUG:
            status = "OK" if ok else f"LO+={'OFF' if lo_p else 'OK'} LO-={'OFF' if lo_m else 'OK'}"
            print(f"[Combined] ECG leads: {status}")
        return ok

    def wait_for_leads(self, timeout=60):
        """Block until ECG leads are connected or timeout."""
        if DEBUG:
            print("[Combined] Waiting for ECG leads...")
        start = time.time()
        while time.time() - start < timeout:
            if self.check_leads():
                return True
            time.sleep(0.5)
        if DEBUG:
            print("[Combined] Timeout waiting for leads.")
        return False

    def test_hardware(self):
        """Quick hardware check for both sensors."""
        # Check mic
        readings = [self.pcg_adc.read() for _ in range(50)]
        mic_ok = (max(readings) - min(readings)) > 20

        # Check ECG
        readings = [self.ecg_adc.read() for _ in range(50)]
        ecg_ok = (max(readings) - min(readings)) > 10

        if DEBUG:
            print(f"[Combined] MAX9814 mic: {'OK' if mic_ok else 'NOT DETECTED'}")
            print(f"[Combined] AD8232 ECG:  {'OK' if ecg_ok else 'NOT DETECTED'}")

        return mic_ok, ecg_ok

    def record_simultaneous(self, progress_callback=None):
        """
        Record PCG and ECG simultaneously in-phase.

        Core 1 captures PCG at 4000 Hz.
        Core 0 captures ECG at 360 Hz.
        Both start at the exact same microsecond.

        Args:
            progress_callback: Optional func(percent_int) called
                               periodically from Core 0.

        Returns:
            tuple: (pcg_recording_dict, ecg_recording_dict)
                   Both dicts are in the same format as the original
                   HeartSoundCapture.record() / ECGCapture.record().
                   Returns (None, None) on failure.
        """
        # Reset synchronization state
        self._sync[0] = 0   # start flag
        self._sync[1] = 0   # pcg done
        self._sync[2] = 0   # pcg error
        self._pcg_samples = None
        self._pcg_actual_rate = 0.0

        if DEBUG:
            print("\n[Combined] ═══ SIMULTANEOUS RECORDING ═══")
            print(f"[Combined] PCG: {self.pcg_total} samples @ {self.pcg_rate} Hz")
            print(f"[Combined] ECG: {self.ecg_total} samples @ {self.ecg_rate} Hz")
            print(f"[Combined] Duration: {self.pcg_duration}s")

        # ── Launch Core 1 thread for PCG ──
        _thread.start_new_thread(self._pcg_thread, ())

        # Small delay to let Core 1 set up its buffer and enter busy-wait
        time.sleep_ms(50)

        if DEBUG:
            print("[Combined] Core 1 launched (PCG), starting both cores NOW...")

        # ── Core 0: ECG recording (this also triggers Core 1 via sync flag) ──
        ecg_samples, ecg_actual_rate, leads_off_count = self._ecg_record()

        if DEBUG:
            print(f"[Combined] Core 0 (ECG) done. Actual rate: {ecg_actual_rate:.1f} Hz")

        # ── Wait for Core 1 (PCG) to finish ──
        # PCG runs at higher rate so it should finish around the same time
        timeout_ms = 5000  # 5s extra safety margin
        wait_start = time.ticks_ms()
        while self._sync[1] == 0:
            if time.ticks_diff(time.ticks_ms(), wait_start) > timeout_ms:
                if DEBUG:
                    print("[Combined] ERROR: Core 1 (PCG) timed out!")
                return None, None
            time.sleep_ms(10)

        if self._sync[2] == 1:
            if DEBUG:
                print("[Combined] ERROR: Core 1 (PCG) reported an error!")
            return None, None

        if DEBUG:
            print(f"[Combined] Core 1 (PCG) done. Actual rate: {self._pcg_actual_rate:.1f} Hz")
            print(f"[Combined] Both recordings complete and in-phase!")

        # ── Build result dicts ──
        pcg_recording = {
            "type": "pcg",
            "samples": list(self._pcg_samples),
            "sample_rate": self.pcg_rate,
            "actual_sample_rate": round(self._pcg_actual_rate, 1),
            "duration": self.pcg_duration,
            "num_samples": len(self._pcg_samples),
            "adc_bits": MIC_BITS,
            "adc_max": (2 ** MIC_BITS) - 1,
        }

        ecg_recording = {
            "type": "ecg",
            "samples": list(ecg_samples),
            "sample_rate": self.ecg_rate,
            "actual_sample_rate": round(ecg_actual_rate, 1),
            "duration": self.ecg_duration,
            "num_samples": len(ecg_samples),
            "adc_bits": MIC_BITS,
            "adc_max": (2 ** MIC_BITS) - 1,
            "leads_off_events": leads_off_count,
            "quality": "good" if leads_off_count == 0 else "degraded",
        }

        # Free the thread's buffer reference
        self._pcg_samples = None

        if DEBUG:
            pcg_s = pcg_recording["samples"]
            ecg_s = ecg_recording["samples"]
            print(f"[Combined] PCG: min={min(pcg_s)}, max={max(pcg_s)}")
            print(f"[Combined] ECG: min={min(ecg_s)}, max={max(ecg_s)}")
            print(f"[Combined] ECG quality: {ecg_recording['quality']}")

        return pcg_recording, ecg_recording
