#!/usr/bin/env python3
"""AscultiCor virtual patient device.

The simulator speaks the same MQTT protocol as the ESP32. It stays online,
waits for a session start command from the AscultiCor UI, and then publishes
real-time ECG and PCG int16 streams through the complete production pipeline.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import ssl
import sys
import threading
import time
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

import numpy as np
import paho.mqtt.client as mqtt


ECG_SAMPLE_RATE = 500
# The ESP32 timer uses 45 microsecond ticks (1_000_000 / 45 = 22_222 Hz).
# The inference service receives this transport rate and resamples to the
# models' 22_050 Hz training rate.
PCG_SAMPLE_RATE = 1_000_000 // 45
ECG_CHUNK_SAMPLES = 500
PCG_CHUNK_SAMPLES = 512


@dataclass(frozen=True)
class Scenario:
    key: str
    title: str
    description: str
    bpm: float
    murmur_timing: str = "none"
    murmur_strength: float = 0.0
    irregularity: float = 0.0
    ecg_class: str = "normal"
    pcg_class: str = "normal"
    murmur_shape: str = "diamond"
    murmur_grade: str = "II/VI"
    murmur_pitch: str = "medium"
    murmur_quality: str = "blowing"
    valve_position: str = "AV"
    artifact_level: float = 0.0


SCENARIOS: dict[str, Scenario] = {
    "normal": Scenario(
        "normal", "Normal sinus rhythm", "Regular ECG with normal S1/S2 heart sounds.", 72,
    ),
    "systolic_murmur": Scenario(
        "systolic_murmur", "Systolic murmur", "Noise-like murmur between S1 and S2.",
        82, "systolic", 0.70, pcg_class="murmur",
    ),
    "diastolic_murmur": Scenario(
        "diastolic_murmur", "Diastolic murmur", "Noise-like murmur after S2.",
        76, "diastolic", 0.62, pcg_class="murmur",
    ),
    "combined_murmur": Scenario(
        "combined_murmur", "Combined murmur", "Murmur energy in systole and diastole.",
        88, "combined", 0.76, pcg_class="murmur",
    ),
    "tachycardia": Scenario(
        "tachycardia", "Tachycardia", "Fast regular ECG with otherwise normal heart sounds.", 118,
    ),
    "bradycardia": Scenario(
        "bradycardia", "Bradycardia", "Slow regular ECG with otherwise normal heart sounds.", 48,
    ),
    "irregular_rhythm": Scenario(
        "irregular_rhythm", "Irregular rhythm", "Beat-to-beat timing variability for ECG pipeline tests.",
        92, "none", 0.0, 0.18, "sveb",
    ),
    "ventricular_ectopy": Scenario(
        "ventricular_ectopy", "Ventricular ectopy",
        "Wide ventricular ectopic morphology inserted every fourth beat.",
        84, ecg_class="veb",
    ),
    "fusion_beats": Scenario(
        "fusion_beats", "Fusion beats",
        "Blended normal and ventricular morphology inserted every fourth beat.",
        78, ecg_class="fusion",
    ),
    "signal_artifact": Scenario(
        "signal_artifact", "Signal artifact",
        "Motion/contact artifact in both ECG and PCG for quality-path testing.",
        80, ecg_class="unknown", pcg_class="artifact", artifact_level=0.72,
    ),
}

ALIASES = {"murmur": "systolic_murmur", "afib": "irregular_rhythm"}

ECG_CLASSES = ("normal", "sveb", "veb", "fusion", "unknown")
PCG_CLASSES = ("normal", "murmur", "artifact")

# ─── Reference lists: what each model considers Normal vs Abnormal ─────────────
#
# PCG model (XGBoost, 3 classes: normal / murmur / artifact)
# ----------------------------------------------------------
PCG_NORMAL_SCENARIOS: list[str] = [
    k for k, s in SCENARIOS.items() if s.pcg_class == "normal"
]
PCG_ABNORMAL_SCENARIOS: list[str] = [
    k for k, s in SCENARIOS.items() if s.pcg_class != "normal"
]

# ECG model (BiLSTM v26 SL, 5 classes: Normal / SVEB / VEB / Fusion / Unknown)
# -----------------------------------------------------------------------------
ECG_NORMAL_SCENARIOS: list[str] = [
    k for k, s in SCENARIOS.items() if s.ecg_class == "normal"
]
ECG_ABNORMAL_SCENARIOS: list[str] = [
    k for k, s in SCENARIOS.items() if s.ecg_class != "normal"
]
MURMUR_TIMINGS = (
    "none", "early-systolic", "mid-systolic", "late-systolic",
    "holosystolic", "systolic", "diastolic", "combined",
)
MURMUR_SHAPES = ("crescendo", "decrescendo", "diamond", "plateau")
MURMUR_GRADES = ("I/VI", "II/VI", "III/VI")
MURMUR_PITCHES = ("low", "medium", "high")
MURMUR_QUALITIES = ("blowing", "harsh", "musical")
VALVE_POSITIONS = ("AV", "MV", "PV", "TV")


@dataclass
class SimulatorConfig:
    mqtt_host: str
    mqtt_port: int
    mqtt_tls: bool
    mqtt_user: str
    mqtt_pass: str
    org_id: str
    device_id: str

    @classmethod
    def from_mapping(cls, raw: dict[str, Any]) -> "SimulatorConfig":
        # Accept either a downloaded simulator config or the credentials object
        # returned by POST /api/devices.
        raw = raw.get("credentials", raw)
        mqtt_block = raw.get("mqtt") if isinstance(raw.get("mqtt"), dict) else {}
        values = {
            "mqtt_host": raw.get("mqtt_host") or mqtt_block.get("host"),
            "mqtt_port": raw.get("mqtt_port") or mqtt_block.get("port") or 1883,
            "mqtt_tls": raw.get("mqtt_tls", mqtt_block.get("use_tls", False)),
            "mqtt_user": raw.get("mqtt_user"),
            "mqtt_pass": raw.get("mqtt_pass"),
            "org_id": raw.get("org_id"),
            "device_id": raw.get("device_id"),
        }
        missing = [key for key, value in values.items() if value is None or value == ""]
        if missing:
            raise ValueError(f"Simulator configuration is missing: {', '.join(missing)}")
        values["mqtt_port"] = int(values["mqtt_port"])
        values["mqtt_tls"] = parse_bool(values["mqtt_tls"])
        return cls(**values)


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def circular_distance(phase: np.ndarray, center: float) -> np.ndarray:
    return ((phase - center + 0.5) % 1.0) - 0.5


def gaussian(phase: np.ndarray, center: float, width: float) -> np.ndarray:
    distance = circular_distance(phase, center)
    return np.exp(-0.5 * (distance / width) ** 2)


def raised_cosine_window(phase: np.ndarray, start: float, end: float) -> np.ndarray:
    """Smooth cardiac-phase window, avoiding hard murmur edges."""
    if end <= start:
        return np.zeros_like(phase)
    x = np.clip((phase - start) / (end - start), 0.0, 1.0)
    inside = (phase >= start) & (phase <= end)
    return np.where(inside, np.sin(np.pi * x) ** 2, 0.0)


def normalize_peak(signal: np.ndarray, peak: float = 1.0) -> np.ndarray:
    max_abs = float(np.max(np.abs(signal))) if signal.size else 0.0
    if max_abs <= 1e-12:
        return signal
    return signal * (peak / max_abs)


def cardiac_phase(times: np.ndarray, scenario: Scenario, seed: int) -> np.ndarray:
    base_hz = scenario.bpm / 60.0
    theta = times * base_hz

    # Apply premature timing warping for ectopic beat classes (SVEB/VEB/Fusion)
    if scenario.ecg_class in {"veb", "sveb", "fusion"}:
        theta_mod = theta % 2.0
        cycle_idx = np.floor(theta / 2.0)
        warped_mod = np.zeros_like(theta_mod)

        # Beat 0: normal timing (ends early at 0.6)
        m1 = (theta_mod >= 0.0) & (theta_mod < 0.6)
        warped_mod[m1] = theta_mod[m1] * (1.0 / 0.6)

        # Beat 1: premature beat timing + compensatory pause (starts early at 0.6, ends at 2.0)
        m2 = (theta_mod >= 0.6) & (theta_mod <= 2.0)
        warped_mod[m2] = 1.0 + (theta_mod[m2] - 0.6) * (1.0 / 1.4)

        theta = cycle_idx * 2.0 + warped_mod

    if scenario.irregularity <= 0:
        return theta % 1.0

    # Smooth deterministic rate modulation: useful for repeatable integration tests.
    modulation = (
        0.60 * np.sin(2 * np.pi * 0.31 * times + seed * 0.01)
        + 0.40 * np.sin(2 * np.pi * 0.17 * times + 1.2)
    )
    integrated_phase = theta + scenario.irregularity * modulation
    return integrated_phase % 1.0


def generate_ecg(
    scenario: Scenario,
    duration_sec: float,
    sample_rate: int = ECG_SAMPLE_RATE,
    seed: int = 7,
) -> np.ndarray:
    """Generate a repeatable P-QRS-T waveform as signed 16-bit samples.

    Scaling contract (aligned with inference pipeline):
      The MQTT handler normalises all int16 data by dividing by 32 768.  So
      the int16 values here must be chosen so that after that division the
      float signal has peaks in the 0.5–0.8 range — the same order of
      magnitude as real MIT-BIH ECG recordings re-scaled from mV.  The old
      mV-literal encoding (*950, clip ±1 650) produced peaks of only ±0.05
      in float, which broke R-peak detection and HRV feature extraction in
      the inference service.
    """
    times = np.arange(round(duration_sec * sample_rate), dtype=np.float64) / sample_rate
    phase = cardiac_phase(times, scenario, seed)
    waveform = (
        0.10 * gaussian(phase, 0.18, 0.026)      # P wave  (~10% of R)
        - 0.08 * gaussian(phase, 0.365, 0.009)   # Q deflection  (~8% of R, narrow)
        + 1.00 * gaussian(phase, 0.400, 0.012)   # R peak  (unit amplitude)
        - 0.12 * gaussian(phase, 0.435, 0.012)   # S deflection  (~12% of R, narrow)
        + 0.18 * gaussian(phase, 0.670, 0.048)   # T wave  (≤18% of R-peak, mirrors MIT-BIH stats)
    )
    rng = np.random.default_rng(seed)

    # Inject AAMI-style morphology into a repeatable subset of beats. The
    # production model consumes four-second, single-lead windows at 125 Hz;
    # publishing at the real device rate lets inference perform the same
    # 500 -> 125 Hz conversion used for hardware sessions.
    beat_number = np.floor(times * (scenario.bpm / 60.0)).astype(np.int64)
    ectopic_mask = (beat_number % 2) == 1
    if scenario.ecg_class == "sveb":
        premature_phase = (phase + 0.18) % 1.0
        sveb = (
            -0.04 * gaussian(premature_phase, 0.35, 0.008)
            + 0.88 * gaussian(premature_phase, 0.40, 0.010)
            - 0.10 * gaussian(premature_phase, 0.43, 0.010)
            + 0.13 * gaussian(premature_phase, 0.64, 0.040)
        )
        waveform = np.where(ectopic_mask, sveb, waveform)
    elif scenario.ecg_class in {"veb", "fusion"}:
        if scenario.ecg_class == "veb":
            # Real clinical PVC/VEB in lead II: wide, deep negative QRS deflection,
            # occurring early (at phase 0.22) followed by an upright wide T-wave.
            ventricular = (
                -0.90 * gaussian(phase, 0.22, 0.045)
                + 0.35 * gaussian(phase, 0.52, 0.08)
            )
            replacement = ventricular
        else:  # fusion
            # Fusion beat is a hybrid shape occurring early
            ventricular = (
                0.92 * gaussian(phase, 0.22, 0.044)
                - 0.52 * gaussian(phase, 0.30, 0.052)
                - 0.20 * gaussian(phase, 0.52, 0.075)
            )
            replacement = 0.48 * waveform + 0.52 * ventricular
        waveform = np.where(ectopic_mask, replacement, waveform)
    elif scenario.ecg_class == "unknown":
        artifact_envelope = (
            raised_cosine_window(phase, 0.12, 0.34)
            + raised_cosine_window(phase, 0.62, 0.82)
        )
        artifact = (
            0.34 * np.sin(2 * np.pi * 37.0 * times)
            + rng.normal(0.0, 0.20, times.size)
        ) * artifact_envelope
        waveform += max(0.35, scenario.artifact_level) * artifact
    # Baseline wander (0.3 Hz respiratory artefact — same as real Holter)
    baseline = 0.025 * np.sin(2 * np.pi * 0.24 * times)
    # Gaussian noise at ~1% of R-peak amplitude
    noise = rng.normal(0.0, 0.012 + scenario.artifact_level * 0.025, times.size)
    # Scale so that after /32768.0 the R-peak sits at ~0.65 float.
    # 0.65 * 32768 ≈ 21 299  →  use 21 000 as the int16 scale factor.
    # Clip at ±25 000 to leave headroom and avoid wrap-around.
    samples = np.clip((waveform + baseline + noise) * 21_000, -25_000, 25_000)
    return samples.astype("<i2")


def pcg_sound_burst(
    times: np.ndarray,
    phase: np.ndarray,
    center: float,
    amplitude: float,
    width: float,
    frequencies: tuple[float, ...],
) -> np.ndarray:
    """Model-aligned S1/S2 burst: damped 20-400 Hz cardiac energy.

    The XGBoost/YAMNet PCG pipeline is trained on 22.05 kHz heart audio that is
    bandpassed at 20-400 Hz and peak-normalised. The harmonics here are spread
    across the full 20-400 Hz physiological band so that YAMNet embeddings land
    in the same sub-space as real stethoscope recordings. Each successive
    harmonic is attenuated by 0.55 (mimicking the natural roll-off of real
    heart-sound resonance chambers).
    """
    distance = circular_distance(phase, center)
    after_sound = (distance >= 0) & (distance < width * 3.4)
    envelope = np.where(after_sound, np.exp(-distance / width), 0.0)
    carrier = np.zeros_like(times)
    for index, frequency in enumerate(frequencies):
        carrier += (0.55 ** index) * np.sin(2 * np.pi * frequency * times)
    carrier /= max(len(frequencies), 1)
    return amplitude * envelope * carrier


def pink_noise(times: np.ndarray, rng: np.random.Generator, amplitude: float = 1.0) -> np.ndarray:
    """Generate approximate pink (1/f) noise via spectral shaping.

    Pink noise is the dominant background in real stethoscope recordings
    (body sounds, breathing, room acoustics).  Adding it to the synthetic
    PCG makes YAMNet embeddings cluster much closer to real PCG data.
    """
    n = times.size
    white = rng.normal(0.0, 1.0, n)
    fft_white = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n)
    # 1/sqrt(f) power shaping → pink spectrum; avoid DC divide-by-zero
    freqs[0] = 1.0
    pink_filter = 1.0 / np.sqrt(freqs)
    pink_filter[0] = 0.0  # suppress DC
    fft_pink = fft_white * pink_filter
    result = np.fft.irfft(fft_pink, n=n)
    return normalize_peak(result, amplitude)


def murmur_band(
    times: np.ndarray,
    seed: int,
    pitch: str = "medium",
    quality: str = "blowing",
) -> np.ndarray:
    """Deterministic 55-390 Hz murmur texture with stochastic broadband energy.

    Extended from 318 Hz to 390 Hz to cover the model's 20-400 Hz
    spectral content (CirCor / PhysioNet training data).  The stochastic pink
    noise component ensures the YAMNet embedding path sees broadband content
    instead of perfectly periodic tones.
    """
    rng = np.random.default_rng(seed)
    frequency_sets = {
        "low": np.array([55.0, 72.0, 92.0, 118.0, 145.0, 180.0]),
        "medium": np.array([92.0, 128.0, 164.0, 211.0, 245.0, 318.0]),
        "high": np.array([180.0, 225.0, 270.0, 318.0, 355.0, 390.0]),
    }
    frequencies = frequency_sets.get(pitch, frequency_sets["medium"])
    phases = rng.uniform(0.0, 2 * np.pi, frequencies.size)
    band = np.zeros_like(times)
    for frequency, phase_offset in zip(frequencies, phases):
        band += np.sin(2 * np.pi * frequency * times + phase_offset)
    band /= frequencies.size
    # Quality controls remain inside the 20-400 Hz model domain. "Musical"
    # favors tones, "blowing" favors broadband energy, and "harsh" mixes both.
    noise_mix = {"musical": 0.06, "blowing": 0.34, "harsh": 0.20}.get(quality, 0.22)
    band += noise_mix * rng.normal(0.0, 1.0, times.size)
    return normalize_peak(band, 1.0)


def apply_murmur_shape(window: np.ndarray, phase: np.ndarray, shape: str) -> np.ndarray:
    """Apply one of the functional model's supported systolic envelopes."""
    active = window > 0
    if not np.any(active) or shape == "plateau":
        return window
    active_phase = phase[active]
    lo = float(np.min(active_phase))
    hi = float(np.max(active_phase))
    progress = np.clip((phase - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    if shape == "crescendo":
        envelope = 0.2 + 0.8 * progress
    elif shape == "decrescendo":
        envelope = 1.0 - 0.8 * progress
    else:  # diamond
        envelope = 0.2 + 0.8 * np.sin(np.pi * progress)
    return window * envelope


def generate_pcg(
    scenario: Scenario,
    duration_sec: float,
    sample_rate: int = PCG_SAMPLE_RATE,
    seed: int = 11,
) -> np.ndarray:
    """Generate model-aligned S1/S2 sounds and optional murmur energy.

    Output follows the same contract as the ESP32 firmware: signed int16 PCM
    at the timer's 22 222 Hz transport rate. The inference service then
    resamples to 22 050 Hz and applies the full training-path
    preprocessing:
      - Traditional track : /32768 → 20-400 Hz bandpass → pad/crop to 10 s
                            → librosa.normalize → 200 traditional features
      - YAMNet track      : /32768 → resample to 16 kHz → crop to 3 s
                            → peak-normalize → 1024-dim embedding

    Key design choices
    ------------------
    S1/S2 frequencies: extended harmonic series up to ~380 Hz so the
      20-400 Hz bandpass passes all harmonics and the YAMNet embedding path
      sees physiologically realistic broadband content.

    Pink noise floor: realistic stethoscope background so YAMNet embeddings
      land in the real-PCG region of the embedding space.  Amplitude is kept
      low enough that a normal scenario stays clearly below the 0.254 murmur
      threshold.

    Diastolic murmur decay: exponential rate raised from 2.3 → 3.8 and
      window end pulled back to 0.870 so the tail is ≤10% amplitude before
      the next systole starts, preventing mis-classification as combined.
    """
    times = np.arange(round(duration_sec * sample_rate), dtype=np.float64) / sample_rate
    phase = cardiac_phase(times, scenario, seed)

    rng = np.random.default_rng(seed)

    # ── S1 and S2 heart sounds ────────────────────────────────────────────────
    # Harmonics now span 20-380 Hz so the full physiological band is covered
    # after the 20-400 Hz bandpass filter in the training/inference pipeline.
    waveform = (
        pcg_sound_burst(
            times, phase, 0.000, 0.86, 0.028,
            (38.0, 68.0, 105.0, 148.0, 198.0, 255.0, 318.0, 380.0),  # S1
        )
        + pcg_sound_burst(
            times, phase, 0.365, 0.62, 0.024,
            (52.0, 88.0, 130.0, 175.0, 228.0, 290.0, 352.0),          # S2
        )
    )

    # ── Murmur window ─────────────────────────────────────────────────────────
    if scenario.murmur_timing == "early-systolic":
        murmur_window = raised_cosine_window(phase, 0.055, 0.185)
    elif scenario.murmur_timing == "mid-systolic":
        murmur_window = raised_cosine_window(phase, 0.135, 0.285)
    elif scenario.murmur_timing == "late-systolic":
        murmur_window = raised_cosine_window(phase, 0.225, 0.350)
    elif scenario.murmur_timing == "holosystolic":
        murmur_window = raised_cosine_window(phase, 0.045, 0.355)
    elif scenario.murmur_timing == "systolic":
        murmur_window = raised_cosine_window(phase, 0.075, 0.335)
    elif scenario.murmur_timing == "diastolic":
        # Faster decay (3.8 vs 2.3) and earlier end (0.870 vs 0.900) so the
        # tail is < 10% amplitude before the next S1 starts — prevents the
        # model from seeing combined-murmur energy.
        murmur_window = (
            raised_cosine_window(phase, 0.440, 0.870)
            * np.exp(-3.8 * np.clip(phase - 0.440, 0, None))
        )
    elif scenario.murmur_timing == "combined":
        murmur_window = np.maximum(
            raised_cosine_window(phase, 0.075, 0.335) * 0.95,
            raised_cosine_window(phase, 0.440, 0.870) * 0.55,
        )
    else:
        murmur_window = np.zeros_like(phase)

    murmur_window = apply_murmur_shape(murmur_window, phase, scenario.murmur_shape)
    grade_scale = {"I/VI": 0.48, "II/VI": 0.72, "III/VI": 1.0}.get(
        scenario.murmur_grade,
        0.72,
    )
    if scenario.murmur_strength > 0 or scenario.pcg_class == "murmur":
        strength = max(scenario.murmur_strength, grade_scale)
        waveform += (
            strength
            * 0.34
            * murmur_band(
                times,
                seed + 91,
                pitch=scenario.murmur_pitch,
                quality=scenario.murmur_quality,
            )
            * murmur_window
        )

    if scenario.pcg_class == "artifact":
        # Contact/motion artifact remains bounded so the signal passes through
        # the pipeline while exercising Model 1's artifact class.
        contact = rng.normal(0.0, 1.0, times.size)
        slow_motion = np.sin(2 * np.pi * 6.5 * times) + 0.45 * np.sin(2 * np.pi * 17.0 * times)
        dropout = np.where((phase > 0.50) & (phase < 0.66), 0.12, 1.0)
        waveform = waveform * dropout + max(0.45, scenario.artifact_level) * (
            0.17 * contact + 0.20 * slow_motion
        )

    # ── Realistic stethoscope background (pink noise) ─────────────────────────
    # Real recordings have a 1/f noise floor from body sounds, breathing, and
    # room acoustics.  YAMNet was trained on such recordings, so adding pink
    # noise here pulls the embedding much closer to real PCG data.
    # Amplitude: 0.010 for normal (safe below 0.254 threshold), 0.015 for
    # pathological (slightly more contact noise from patient movement).
    noise_amp = 0.010 if scenario.pcg_class == "normal" else 0.015
    noise_amp += scenario.artifact_level * 0.018
    waveform += pink_noise(times, rng, amplitude=noise_amp)

    # Very small additive white noise for dithering (avoids perfect periodicity)
    waveform += rng.normal(0.0, 0.004, times.size)

    waveform = normalize_peak(waveform, 0.92)
    # Scale so peaks sit at ~0.84 after /32768.0  (0.92 * 30 000 / 32 768 ≈ 0.84)
    samples = np.clip(waveform * 30_000, -31_500, 31_500)
    return samples.astype("<i2")


class AscultiCorSimulator:
    def __init__(self, config: SimulatorConfig, scenario: Scenario, seed: int = 2026):
        self.config = config
        self.scenario = scenario
        self.seed = seed
        self.started_at = time.monotonic()
        self.stop_event = threading.Event()
        self.streaming_event = threading.Event()
        self.session_lock = threading.Lock()
        self.session_thread: threading.Thread | None = None
        self.client = mqtt.Client(
            client_id=f"AscultiCor-Simulator-{config.device_id}",
            clean_session=True,   # always clears zombie sessions on broker side
        )
        self.client.username_pw_set(config.mqtt_user, config.mqtt_pass)
        if config.mqtt_tls:
            self.client.tls_set_context(ssl.create_default_context())
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    @property
    def topic_base(self) -> str:
        return f"org/{self.config.org_id}/device/{self.config.device_id}"

    def publish_json(self, topic: str, value: dict[str, Any], qos: int = 1, retain: bool = False) -> None:
        """Publish a JSON payload. Logs a warning on transient disconnect instead of raising.

        rc=4 (MQTT_ERR_NO_CONN) and rc=7 (MQTT_ERR_CONN_LOST) happen when the
        broker drops us mid-session (e.g. duplicate client-ID takeover).  The
        paho reconnect loop will restore the connection; raising here would kill
        the entire process for a transient network event.
        """
        result = self.client.publish(topic, json.dumps(value, separators=(",", ":")), qos=qos, retain=retain)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            print(f"[MQTT] publish skipped for {topic}: rc={result.rc} (reconnecting)", file=sys.stderr)

    def status_payload(self, status: str = "online", streaming: bool = False) -> dict[str, Any]:
        return {
            "status": status,
            "ip": "virtual",
            "rssi": -35,
            "firmware_version": "simulator-1.0.0",
            "mode": "simulator",
            "wifi": "simulated",
            "mqtt": "connected" if status == "online" else "disconnected",
            "free_heap": 0,
            "streaming": streaming,
            "synthetic": True,
            "scenario": self.scenario.key,
            "ecg_class": self.scenario.ecg_class,
            "pcg_class": self.scenario.pcg_class,
        }

    def _on_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, rc: int) -> None:
        if rc != 0:
            print(f"[MQTT] Connection rejected (rc={rc})", file=sys.stderr)
            return
        control_topic = f"{self.topic_base}/control"
        client.subscribe(control_topic, qos=1)
        self.publish_json(f"{self.topic_base}/status", self.status_payload(), retain=True)
        print(f"[MQTT] Online and listening on {control_topic}")

    def _on_disconnect(self, _client: mqtt.Client, _userdata: Any, rc: int) -> None:
        if not self.stop_event.is_set():
            print(f"[MQTT] Disconnected (rc={rc}); reconnecting automatically...")

    def _on_message(self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage) -> None:
        try:
            command = json.loads(message.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            print(f"[CONTROL] Ignoring invalid JSON: {exc}", file=sys.stderr)
            return

        if command.get("command") == "start":
            session_id = str(command.get("session_id") or "")
            # Minimum 12 s: the PCG traditional-feature path pads/crops to
            # exactly 10 s. At 8 s, 2 s of zeros would be appended, skewing
            # MFCC statistics vs. training data (always ≥ 10 s recordings).
            duration = max(12, min(60, int(command.get("duration_sec") or 15)))
            if not session_id:
                print("[CONTROL] Start command is missing session_id", file=sys.stderr)
                return
            with self.session_lock:
                if self.session_thread and self.session_thread.is_alive():
                    print("[CONTROL] A simulated session is already running; start ignored.")
                    return
                self.session_thread = threading.Thread(
                    target=self._stream_session,
                    args=(session_id, duration),
                    daemon=True,
                    name=f"sim-session-{session_id[:8]}",
                )
                self.session_thread.start()
        elif command.get("command") == "stop":
            self.stop_event.set()

    def _publish_meta(self, session_id: str, payload: dict[str, Any]) -> None:
        payload = {
            **payload,
            "session_id": session_id,
            "device_id": self.config.device_id,
            "timestamp_ms": int((time.monotonic() - self.started_at) * 1000),
            "synthetic": True,
            "scenario": self.scenario.key,
            "synthetic_profile": asdict(self.scenario),
        }
        self.publish_json(f"{self.topic_base}/session/{session_id}/meta", payload)

    def _stream_session(self, session_id: str, duration: int) -> None:
        self.stop_event.clear()
        self.streaming_event.set()
        prefix = f"{self.topic_base}/session/{session_id}"
        try:
            print(f"[SESSION] {session_id}: {self.scenario.title}, {duration}s")
            self._publish_meta(session_id, {
                "type": "preflight_ok",
                "passed": True,
                "reason": "synthetic signal ready",
                "requested_duration_sec": duration,
                "ecg_leads_connected": True,
                "ecg_signal_present": True,
                "ecg_peak_to_peak_mv": 1200,
                "pcg_capture_enabled": True,
                "pcg_signal_present": True,
                "pcg_clipping_detected": False,
            })
            self._publish_meta(session_id, {
                "type": "start_pcg", "valve_position": self.scenario.valve_position,
                "sample_rate_hz": PCG_SAMPLE_RATE, "format": "pcm_s16le",
                "channels": 1, "chunk_samples": PCG_CHUNK_SAMPLES,
                "target_duration_sec": duration, "microphone": "virtual-pcg",
                "gain_db": 60,
            })
            self._publish_meta(session_id, {
                "type": "start_ecg", "sample_rate_hz": ECG_SAMPLE_RATE,
                "format": "int16_mv", "lead": "MLII", "n_leads": 1,
                "chunk_samples": ECG_CHUNK_SAMPLES, "target_duration_sec": duration,
                "adc_resolution": 12, "ecg_model": "AuscultICor_v26_SL",
            })
            self.publish_json(f"{self.topic_base}/status", self.status_payload(streaming=True), retain=True)

            ecg = generate_ecg(self.scenario, duration, seed=self.seed)
            pcg = generate_pcg(self.scenario, duration, seed=self.seed + 1)
            ecg_index = pcg_index = 0
            started = time.monotonic()
            next_ecg_at = started
            next_pcg_at = started
            next_heartbeat = started + 5.0

            while not self.stop_event.is_set() and (ecg_index < ecg.size or pcg_index < pcg.size):
                now = time.monotonic()

                if ecg_index < ecg.size and now >= next_ecg_at:
                    start_index = ecg_index
                    end = min(ecg_index + ECG_CHUNK_SAMPLES, ecg.size)
                    self.client.publish(f"{prefix}/ecg", ecg[ecg_index:end].tobytes(), qos=0)
                    ecg_index = end
                    next_ecg_at += (end - start_index) / ECG_SAMPLE_RATE

                if pcg_index < pcg.size and now >= next_pcg_at:
                    start_index = pcg_index
                    end = min(pcg_index + PCG_CHUNK_SAMPLES, pcg.size)
                    self.client.publish(f"{prefix}/pcg", pcg[pcg_index:end].tobytes(), qos=0)
                    pcg_index = end
                    next_pcg_at += (end - start_index) / PCG_SAMPLE_RATE

                if now >= next_heartbeat:
                    self.publish_json(f"{prefix}/heartbeat", {
                        "timestamp_ms": int((now - self.started_at) * 1000),
                        "device_id": self.config.device_id,
                        "uptime_sec": int(now - self.started_at),
                        "rssi": -35, "synthetic": True, "scenario": self.scenario.key,
                    }, qos=0)
                    next_heartbeat += 5.0
                next_due = min(
                    next_ecg_at if ecg_index < ecg.size else next_heartbeat,
                    next_pcg_at if pcg_index < pcg.size else next_heartbeat,
                    next_heartbeat,
                )
                time.sleep(max(0.001, min(0.02, next_due - time.monotonic())))

            self._publish_meta(session_id, {"type": "end_pcg"})
            time.sleep(0.12)
            self._publish_meta(session_id, {"type": "end_ecg"})
            print(f"[SESSION] {session_id}: stream complete; AI processing started.")
        except Exception as exc:
            print(f"[SESSION] Streaming failed: {exc}", file=sys.stderr)
        finally:
            try:
                self.publish_json(f"{self.topic_base}/status", self.status_payload(), retain=True)
            except Exception:
                pass
            self.streaming_event.clear()
            self.stop_event.clear()

    def run(self) -> None:
        offline = json.dumps(self.status_payload(status="offline"), separators=(",", ":"))
        self.client.will_set(f"{self.topic_base}/status", offline, qos=1, retain=True)
        print(f"[SIMULATOR] Scenario: {self.scenario.title} ({self.scenario.key})")
        print(
            "[PROFILE] "
            f"ECG={self.scenario.ecg_class} {self.scenario.bpm:g}BPM, "
            f"PCG={self.scenario.pcg_class}, timing={self.scenario.murmur_timing}, "
            f"grade={self.scenario.murmur_grade}, valve={self.scenario.valve_position}"
        )
        print(f"[MQTT] Connecting to {self.config.mqtt_host}:{self.config.mqtt_port} TLS={self.config.mqtt_tls}")
        self.client.connect(self.config.mqtt_host, self.config.mqtt_port, keepalive=60)
        self.client.loop_start()
        try:
            # Give the broker a moment to expire any previous session with the
            # same client-ID before we start sending retained status messages.
            time.sleep(3)
            while True:
                time.sleep(10)
                if self.client.is_connected():
                    self.publish_json(
                        f"{self.topic_base}/status",
                        self.status_payload(streaming=self.streaming_event.is_set()),
                        retain=True,
                    )
        except KeyboardInterrupt:
            print("\n[SIMULATOR] Stopping...")
        finally:
            self.stop_event.set()
            try:
                if self.client.is_connected():
                    self.publish_json(
                        f"{self.topic_base}/status",
                        self.status_payload(status="offline"),
                        retain=True,
                    )
            except Exception:
                pass
            self.client.disconnect()
            self.client.loop_stop()


def _prompt_choice(prompt: str, options: list, default: int = 1) -> int:
    """Print a numbered menu and return the chosen 0-based index."""
    for idx, label in enumerate(options, start=1):
        print(f"  {idx}. {label}")
    while True:
        raw = input(f"{prompt} [{default}]: ").strip() or str(default)
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return int(raw) - 1
        print(f"  Please enter a number between 1 and {len(options)}.")


def select_scenario(
    requested: str | None = None,
    pcg_key: str | None = None,
    ecg_key: str | None = None,
) -> Scenario:
    """
    Choose a Scenario to simulate.

    Priority order:
      1. --scenario <key>                  single combined preset
      2. --pcg-scenario / --ecg-scenario   mix two named presets
      3. Interactive two-step prompt        PCG class then ECG class
      4. Non-TTY fallback                  → 'normal'
    """
    # ── 1. Single named scenario ──────────────────────────────────────────────
    if requested:
        key = ALIASES.get(requested, requested)
        if key not in SCENARIOS:
            raise ValueError(f"Unknown scenario '{requested}'. Use --list-scenarios.")
        return SCENARIOS[key]

    # ── 2. Explicit --pcg-scenario / --ecg-scenario mix ──────────────────────
    if pcg_key or ecg_key:
        pcg_base = SCENARIOS.get(
            ALIASES.get(pcg_key or "normal", pcg_key or "normal"), SCENARIOS["normal"]
        )
        ecg_base = SCENARIOS.get(
            ALIASES.get(ecg_key or "normal", ecg_key or "normal"), SCENARIOS["normal"]
        )
        return replace(
            pcg_base,
            ecg_class=ecg_base.ecg_class,
            irregularity=ecg_base.irregularity,
        )

    # ── 3. Non-interactive fallback ───────────────────────────────────────────
    if not sys.stdin.isatty():
        return SCENARIOS["normal"]

    # ── 4. Interactive two-step selector ─────────────────────────────────────
    print("\n" + "=" * 60)
    print(" AscultiCor Simulator — Virtual Patient Configuration")
    print("=" * 60)

    # Step 1: PCG
    print("\nStep 1 of 2 — PCG (heart sounds)")
    print("-" * 40)
    pcg_type_options = [
        f"Normal heart sounds   ({', '.join(PCG_NORMAL_SCENARIOS)})",
        f"Abnormal heart sounds ({', '.join(PCG_ABNORMAL_SCENARIOS)})",
    ]
    pcg_type_idx = _prompt_choice("PCG type", pcg_type_options)

    if pcg_type_idx == 0:
        pcg_scenario_key = PCG_NORMAL_SCENARIOS[0]
    else:
        print("\n  Which abnormal PCG case?")
        abnormal_labels = [
            f"{k:25} — {SCENARIOS[k].title}" for k in PCG_ABNORMAL_SCENARIOS
        ]
        pcg_scenario_key = PCG_ABNORMAL_SCENARIOS[_prompt_choice("Case", abnormal_labels)]

    # Step 2: ECG
    print("\nStep 2 of 2 — ECG (rhythm)")
    print("-" * 40)
    ecg_type_options = [
        f"Normal sinus rhythm  ({', '.join(ECG_NORMAL_SCENARIOS[:3])} …)",
        f"Abnormal rhythm      ({', '.join(ECG_ABNORMAL_SCENARIOS)})",
    ]
    ecg_type_idx = _prompt_choice("ECG type", ecg_type_options)

    if ecg_type_idx == 0:
        ecg_scenario_key = "normal"
    else:
        print("\n  Which abnormal ECG case?")
        ecg_labels = [
            f"{k:25} — {SCENARIOS[k].title}  [{SCENARIOS[k].ecg_class.upper()}]"
            for k in ECG_ABNORMAL_SCENARIOS
        ]
        ecg_scenario_key = ECG_ABNORMAL_SCENARIOS[_prompt_choice("Case", ecg_labels)]

    # Build composite: PCG profile + ECG class from chosen ECG scenario
    pcg_base = SCENARIOS[pcg_scenario_key]
    ecg_base = SCENARIOS[ecg_scenario_key]
    combined = replace(
        pcg_base,
        ecg_class=ecg_base.ecg_class,
        irregularity=ecg_base.irregularity,
    )

    print("\n" + "-" * 60)
    print(f"  PCG : {pcg_base.title}  [{pcg_base.pcg_class}]")
    print(f"  ECG : {ecg_base.title}  [{ecg_base.ecg_class.upper()}]")
    print("-" * 60)
    return combined



def load_config(path: str | None) -> SimulatorConfig:
    if path:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    else:
        raw = {
            "mqtt_host": os.getenv("ASCULTICOR_MQTT_HOST"),
            "mqtt_port": os.getenv("ASCULTICOR_MQTT_PORT", "8883"),
            "mqtt_tls": os.getenv("ASCULTICOR_MQTT_TLS", "true"),
            "mqtt_user": os.getenv("ASCULTICOR_MQTT_USER"),
            "mqtt_pass": os.getenv("ASCULTICOR_MQTT_PASSWORD"),
            "org_id": os.getenv("ASCULTICOR_ORG_ID"),
            "device_id": os.getenv("ASCULTICOR_DEVICE_ID"),
        }
    return SimulatorConfig.from_mapping(raw)


def build_signal_profile(base: Scenario, args: argparse.Namespace) -> Scenario:
    """Apply explicit model-domain controls to a named base scenario."""
    updates: dict[str, Any] = {}
    option_to_field = {
        "heart_rate": "bpm",
        "ecg_class": "ecg_class",
        "pcg_class": "pcg_class",
        "irregularity": "irregularity",
        "murmur_timing": "murmur_timing",
        "murmur_strength": "murmur_strength",
        "murmur_shape": "murmur_shape",
        "murmur_grade": "murmur_grade",
        "murmur_pitch": "murmur_pitch",
        "murmur_quality": "murmur_quality",
        "valve_position": "valve_position",
        "artifact_level": "artifact_level",
    }
    for option, field in option_to_field.items():
        value = getattr(args, option, None)
        if value is not None:
            updates[field] = value

    profile = replace(base, **updates)
    if not 35 <= profile.bpm <= 180:
        raise ValueError("heart rate must be between 35 and 180 BPM")
    if not 0.0 <= profile.irregularity <= 0.30:
        raise ValueError("irregularity must be between 0.0 and 0.30")
    if not 0.0 <= profile.murmur_strength <= 1.0:
        raise ValueError("murmur strength must be between 0.0 and 1.0")
    if not 0.0 <= profile.artifact_level <= 1.0:
        raise ValueError("artifact level must be between 0.0 and 1.0")

    if profile.pcg_class == "murmur" and profile.murmur_timing == "none":
        profile = replace(profile, murmur_timing="mid-systolic")
    if profile.pcg_class == "normal" and args.murmur_timing not in (None, "none"):
        raise ValueError("choose --pcg-class murmur when selecting murmur timing")
    if profile.pcg_class == "artifact" and profile.artifact_level == 0:
        profile = replace(profile, artifact_level=0.65)

    return profile


def print_model_domain() -> None:
    print("ECG model: single-lead MLII, transport 500 Hz, inference 125 Hz, 500-sample windows")
    print("  classes: normal, sveb, veb, fusion, unknown")
    print("PCG Model 1: mono PCM, transport 22222 Hz, inference 22050 Hz, 10 s + YAMNet 3 s")
    print("  classes: normal, murmur, artifact")
    print("PCG Model 2: 4 valve channels represented by one selected capture position")
    print("  timing: early-systolic, mid-systolic, late-systolic, holosystolic")
    print("  shape: crescendo, decrescendo, diamond, plateau")
    print("  grade: I/VI, II/VI, III/VI; pitch: low, medium, high")
    print("  quality: blowing, harsh, musical; valve: AV, MV, PV, TV")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Stream a synthetic patient through AscultiCor MQTT."
    )
    parser.add_argument(
        "--config",
        help="JSON file downloaded/generated when the virtual device is created.",
    )

    # ── Scenario selection ───────────────────────────────────────────────────
    sg = parser.add_argument_group(
        "scenario",
        "Choose what the simulator generates. Use --scenario for a single preset, "
        "or combine --pcg-scenario and --ecg-scenario to mix PCG and ECG "
        "independently. Omitting all three launches the interactive two-step prompt.",
    )
    sg.add_argument(
        "--scenario",
        choices=sorted(set(SCENARIOS) | set(ALIASES)),
        help="Single combined preset (controls both ECG and PCG).",
    )
    sg.add_argument(
        "--pcg-scenario",
        choices=sorted(SCENARIOS),
        metavar="PCG_KEY",
        help=(
            "PCG preset for heart-sound generation. "
            f"Normal: {', '.join(PCG_NORMAL_SCENARIOS)}. "
            f"Abnormal: {', '.join(PCG_ABNORMAL_SCENARIOS)}."
        ),
    )
    sg.add_argument(
        "--ecg-scenario",
        choices=sorted(SCENARIOS),
        metavar="ECG_KEY",
        help=(
            "ECG preset for rhythm generation. "
            f"Normal: {', '.join(ECG_NORMAL_SCENARIOS)}. "
            f"Abnormal: {', '.join(ECG_ABNORMAL_SCENARIOS)}."
        ),
    )

    parser.add_argument(
        "--sessions",
        type=int,
        default=0,
        metavar="N",
        help=(
            "Number of sessions to run automatically then exit (default: 0). "
            "Use 0 to stay online and wait for UI-triggered sessions."
        ),
    )
    parser.add_argument("--seed", type=int, default=2026, help="Deterministic signal seed.")
    parser.add_argument("--list-scenarios", action="store_true")
    parser.add_argument("--describe-model-domain", action="store_true")
    parser.add_argument("--heart-rate", type=float, help="35-180 BPM.")
    parser.add_argument("--ecg-class", choices=ECG_CLASSES)
    parser.add_argument("--pcg-class", choices=PCG_CLASSES)
    parser.add_argument("--irregularity", type=float, help="Beat timing variability, 0.0-0.30.")
    parser.add_argument("--murmur-timing", choices=MURMUR_TIMINGS)
    parser.add_argument("--murmur-strength", type=float, help="Murmur amplitude, 0.0-1.0.")
    parser.add_argument("--murmur-shape", choices=MURMUR_SHAPES)
    parser.add_argument("--murmur-grade", choices=MURMUR_GRADES)
    parser.add_argument("--murmur-pitch", choices=MURMUR_PITCHES)
    parser.add_argument("--murmur-quality", choices=MURMUR_QUALITIES)
    parser.add_argument("--valve-position", choices=VALVE_POSITIONS)
    parser.add_argument("--artifact-level", type=float, help="Contact/motion artifact, 0.0-1.0.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.list_scenarios:
        print(f"{'KEY':<22} {'ECG':^7} {'PCG':^8}  TITLE")
        print("-" * 65)
        for s in SCENARIOS.values():
            marker = " [abnormal]" if s.ecg_class != "normal" or s.pcg_class != "normal" else ""
            print(f"{s.key:<22} {s.ecg_class:^7} {s.pcg_class:^8}  {s.title}{marker}")
        print()
        print(f"PCG normal   : {', '.join(PCG_NORMAL_SCENARIOS)}")
        print(f"PCG abnormal : {', '.join(PCG_ABNORMAL_SCENARIOS)}")
        print(f"ECG normal   : {', '.join(ECG_NORMAL_SCENARIOS)}")
        print(f"ECG abnormal : {', '.join(ECG_ABNORMAL_SCENARIOS)}")
        return 0
    if args.describe_model_domain:
        print_model_domain()
        return 0
    try:
        config = load_config(args.config)
        scenario = build_signal_profile(
            select_scenario(
                requested=args.scenario,
                pcg_key=getattr(args, "pcg_scenario", None),
                ecg_key=getattr(args, "ecg_scenario", None),
            ),
            args,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    n_sessions = args.sessions
    simulator = AscultiCorSimulator(config, scenario, seed=args.seed)
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))

    if n_sessions == 0:
        # Stay online indefinitely; sessions are triggered by the UI via MQTT.
        print("[SIMULATOR] Online mode — waiting for UI-triggered sessions (Ctrl+C to quit).")
        simulator.run()
    else:
        # Auto-run N sessions sequentially then exit.
        import uuid
        simulator.client.connect(config.mqtt_host, config.mqtt_port, keepalive=60)
        simulator.client.loop_start()
        time.sleep(3)  # let broker settle
        print(f"[SIMULATOR] Auto-session mode: running {n_sessions} session(s).")
        try:
            for i in range(1, n_sessions + 1):
                session_id = str(uuid.uuid4())
                print(f"\n[SESSION {i}/{n_sessions}] id={session_id[:8]}\u2026")
                simulator._stream_session(session_id, duration=15)
                if i < n_sessions:
                    print(f"[SESSION {i}/{n_sessions}] Done. Waiting 5 s before next\u2026")
                    time.sleep(5)
        except KeyboardInterrupt:
            print("\n[SIMULATOR] Interrupted.")
        finally:
            simulator.client.disconnect()
            simulator.client.loop_stop()
        print(f"[SIMULATOR] All {n_sessions} session(s) complete.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
