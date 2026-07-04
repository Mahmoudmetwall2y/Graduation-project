"""Verify that the current simulator ECG output produces correct BPM via the
exact same detection logic used in inference.py's _estimate_heart_rate()."""
import sys, numpy as np
from pathlib import Path
import importlib.util

p = Path(__file__).resolve().parents[1] / "asculticor_patient_simulator.py"
spec = importlib.util.spec_from_file_location("fresh_sim", p)
sim = importlib.util.module_from_spec(spec)
sys.modules["fresh_sim"] = sim   # must register before exec_module for dataclass to work
spec.loader.exec_module(sim)

from scipy.signal import find_peaks, resample as sp_resample, butter, filtfilt

def denoise(ecg, window=5):
    kernel = np.ones(window) / window
    return np.convolve(ecg, kernel, mode="same")

def bandpass_bascorr(ecg, sr=125):
    nyq = sr / 2.0
    b, a = butter(4, [0.5 / nyq, 50.0 / nyq], btype="band")
    ecg = filtfilt(b, a, ecg)
    b2, a2 = butter(1, 0.5 / nyq, btype="high")
    return filtfilt(b2, a2, ecg)

print("=" * 55)
print("ECG waveform coefficients loaded from file:")
src = p.read_text(encoding="utf-8")
for kw in ("gaussian(phase, 0.18", "gaussian(phase, 0.365", "gaussian(phase, 0.400",
           "gaussian(phase, 0.435", "gaussian(phase, 0.670"):
    start = src.find(kw) - 10
    end   = src.find("\n", start)
    print(" ", src[start:end].strip())
print("=" * 55)

for scenario_key, expected_bpm in [("bradycardia", 48), ("tachycardia", 118), ("normal", 72)]:
    raw = sim.generate_ecg(sim.SCENARIOS[scenario_key], 15, seed=7)
    signal = raw.astype(np.float32) / 32768.0
    signal_125 = sp_resample(signal, int(len(signal) * 125 / 500))
    signal_125 = bandpass_bascorr(signal_125.astype(np.float64))
    signal_125 = denoise(signal_125)
    energy = np.abs(signal_125)
    prom = max(float(np.std(energy)) * 0.8, 0.05)
    min_d = max(1, int(125 * 0.3))
    peaks, _ = find_peaks(energy, distance=min_d, prominence=prom)
    rr = np.diff(peaks) / 125.0
    rr_f = rr[(rr >= 0.3) & (rr <= 2.0)]
    bpm = 60.0 / float(np.median(rr_f)) if len(rr_f) else None
    status = "OK" if bpm and abs(bpm - expected_bpm) <= 22 else "FAIL"
    print(f"[{status}] {scenario_key}: peaks={len(peaks)}, BPM={round(bpm,1) if bpm else 'N/A'}, expected={expected_bpm}")
