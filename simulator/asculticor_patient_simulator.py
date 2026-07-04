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
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import paho.mqtt.client as mqtt


ECG_SAMPLE_RATE = 500
PCG_SAMPLE_RATE = 22_050
ECG_CHUNK_SAMPLES = 125
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


SCENARIOS: dict[str, Scenario] = {
    "normal": Scenario(
        "normal", "Normal sinus rhythm", "Regular ECG with normal S1/S2 heart sounds.", 72,
    ),
    "systolic_murmur": Scenario(
        "systolic_murmur", "Systolic murmur", "Noise-like murmur between S1 and S2.",
        82, "systolic", 0.70,
    ),
    "diastolic_murmur": Scenario(
        "diastolic_murmur", "Diastolic murmur", "Noise-like murmur after S2.",
        76, "diastolic", 0.62,
    ),
    "combined_murmur": Scenario(
        "combined_murmur", "Combined murmur", "Murmur energy in systole and diastole.",
        88, "combined", 0.76,
    ),
    "tachycardia": Scenario(
        "tachycardia", "Tachycardia", "Fast regular ECG with otherwise normal heart sounds.", 118,
    ),
    "bradycardia": Scenario(
        "bradycardia", "Bradycardia", "Slow regular ECG with otherwise normal heart sounds.", 48,
    ),
    "irregular_rhythm": Scenario(
        "irregular_rhythm", "Irregular rhythm", "Beat-to-beat timing variability for ECG pipeline tests.",
        92, "none", 0.0, 0.18,
    ),
}

ALIASES = {"murmur": "systolic_murmur", "afib": "irregular_rhythm"}


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
    if scenario.irregularity <= 0:
        return (times * base_hz) % 1.0

    # Smooth deterministic rate modulation: useful for repeatable integration tests.
    modulation = (
        0.60 * np.sin(2 * np.pi * 0.31 * times + seed * 0.01)
        + 0.40 * np.sin(2 * np.pi * 0.17 * times + 1.2)
    )
    integrated_phase = base_hz * times + scenario.irregularity * modulation
    return integrated_phase % 1.0


def generate_ecg(
    scenario: Scenario,
    duration_sec: float,
    sample_rate: int = ECG_SAMPLE_RATE,
    seed: int = 7,
) -> np.ndarray:
    """Generate a repeatable P-QRS-T waveform as signed 16-bit samples."""
    times = np.arange(round(duration_sec * sample_rate), dtype=np.float64) / sample_rate
    phase = cardiac_phase(times, scenario, seed)
    waveform = (
        0.12 * gaussian(phase, 0.18, 0.028)
        - 0.18 * gaussian(phase, 0.365, 0.010)
        + 1.00 * gaussian(phase, 0.400, 0.012)
        - 0.28 * gaussian(phase, 0.435, 0.014)
        + 0.32 * gaussian(phase, 0.670, 0.055)
    )
    rng = np.random.default_rng(seed)
    baseline = 0.025 * np.sin(2 * np.pi * 0.24 * times)
    noise = rng.normal(0.0, 0.012, times.size)
    # Match the ESP32 firmware contract: signed int16 values represent
    # millivolts centered around zero, not full-scale audio samples.
    samples = np.clip((waveform + baseline + noise) * 950, -1_650, 1_650)
    return samples.astype("<i2")


def pcg_sound_burst(
    times: np.ndarray,
    phase: np.ndarray,
    center: float,
    amplitude: float,
    width: float,
    frequencies: tuple[float, ...],
) -> np.ndarray:
    """Model-aligned S1/S2 burst: damped 40-180 Hz cardiac energy.

    The XGBoost/YAMNet PCG pipeline is trained on 22.05 kHz heart audio that is
    bandpassed at 20-400 Hz and peak-normalized. Very narrow synthetic impulses
    or broadband differentiated noise can look like artifacts/murmurs. These
    bursts deliberately stay in the same physiological band as real S1/S2.
    """
    distance = circular_distance(phase, center)
    after_sound = (distance >= 0) & (distance < width * 3.4)
    envelope = np.where(after_sound, np.exp(-distance / width), 0.0)
    carrier = np.zeros_like(times)
    for index, frequency in enumerate(frequencies):
        carrier += (0.65 ** index) * np.sin(2 * np.pi * frequency * times)
    carrier /= max(len(frequencies), 1)
    return amplitude * envelope * carrier


def murmur_band(times: np.ndarray, seed: int) -> np.ndarray:
    """Deterministic 90-320 Hz murmur texture without out-of-band spikes."""
    rng = np.random.default_rng(seed)
    frequencies = np.array([92.0, 128.0, 164.0, 211.0, 265.0, 318.0])
    phases = rng.uniform(0.0, 2 * np.pi, frequencies.size)
    band = np.zeros_like(times)
    for frequency, phase_offset in zip(frequencies, phases):
        band += np.sin(2 * np.pi * frequency * times + phase_offset)
    band /= frequencies.size
    band += 0.18 * rng.normal(0.0, 1.0, times.size)
    return normalize_peak(band, 1.0)


def generate_pcg(
    scenario: Scenario,
    duration_sec: float,
    sample_rate: int = PCG_SAMPLE_RATE,
    seed: int = 11,
) -> np.ndarray:
    """Generate model-aligned S1/S2 sounds and optional murmur energy.

    Output intentionally follows the same contract as the ESP32 firmware:
    signed int16 PCM at 22 050 Hz. The inference service converts this to
    float audio and then applies the model training path: 20-400 Hz bandpass,
    10 s crop/pad, librosa/YAMNet normalization. So the simulator should look
    like plausible phonocardiogram audio before that preprocessing, not like a
    visualization-only waveform.
    """
    times = np.arange(round(duration_sec * sample_rate), dtype=np.float64) / sample_rate
    phase = cardiac_phase(times, scenario, seed)

    rng = np.random.default_rng(seed)
    waveform = (
        pcg_sound_burst(times, phase, 0.000, 0.86, 0.028, (42.0, 74.0, 112.0, 155.0))
        + pcg_sound_burst(times, phase, 0.365, 0.62, 0.024, (56.0, 92.0, 138.0, 176.0))
    )

    if scenario.murmur_timing == "systolic":
        murmur_window = raised_cosine_window(phase, 0.075, 0.335)
    elif scenario.murmur_timing == "diastolic":
        murmur_window = raised_cosine_window(phase, 0.440, 0.900) * np.exp(-2.3 * np.clip(phase - 0.440, 0, None))
    elif scenario.murmur_timing == "combined":
        murmur_window = np.maximum(
            raised_cosine_window(phase, 0.075, 0.335) * 0.95,
            raised_cosine_window(phase, 0.440, 0.900) * 0.55,
        )
    else:
        murmur_window = np.zeros_like(phase)

    if scenario.murmur_strength > 0:
        waveform += scenario.murmur_strength * 0.34 * murmur_band(times, seed + 91) * murmur_window

    # Low-amplitude acquisition floor: enough for realistic feature extraction,
    # not enough to dominate YAMNet/traditional features for normal cases.
    waveform += rng.normal(0.0, 0.0045 if scenario.murmur_timing == "none" else 0.0065, times.size)
    waveform = normalize_peak(waveform, 0.92)
    samples = np.clip(waveform * 18_000, -21_500, 21_500)
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
        self.client = mqtt.Client(client_id=f"AscultiCor-Simulator-{config.device_id}")
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
        result = self.client.publish(topic, json.dumps(value, separators=(",", ":")), qos=qos, retain=retain)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"MQTT publish failed for {topic}: rc={result.rc}")

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
            duration = max(8, min(60, int(command.get("duration_sec") or 15)))
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
                "type": "start_pcg", "valve_position": "AV",
                "sample_rate_hz": PCG_SAMPLE_RATE, "format": "pcm_s16le",
                "channels": 1, "chunk_samples": PCG_CHUNK_SAMPLES,
                "target_duration_sec": duration, "microphone": "virtual-pcg",
            })
            self._publish_meta(session_id, {
                "type": "start_ecg", "sample_rate_hz": ECG_SAMPLE_RATE,
                "format": "int16_mv", "lead": "MLII", "n_leads": 1,
                "chunk_samples": ECG_CHUNK_SAMPLES, "target_duration_sec": duration,
                "ecg_model": "AuscultICor_v26_SL",
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
            self.publish_json(f"{self.topic_base}/status", self.status_payload(), retain=True)
            self.streaming_event.clear()
            self.stop_event.clear()

    def run(self) -> None:
        offline = json.dumps(self.status_payload(status="offline"), separators=(",", ":"))
        self.client.will_set(f"{self.topic_base}/status", offline, qos=1, retain=True)
        print(f"[SIMULATOR] Scenario: {self.scenario.title} ({self.scenario.key})")
        print(f"[MQTT] Connecting to {self.config.mqtt_host}:{self.config.mqtt_port} TLS={self.config.mqtt_tls}")
        self.client.connect(self.config.mqtt_host, self.config.mqtt_port, keepalive=30)
        self.client.loop_start()
        try:
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
            if self.client.is_connected():
                self.publish_json(
                    f"{self.topic_base}/status",
                    self.status_payload(status="offline"),
                    retain=True,
                )
            self.client.disconnect()
            self.client.loop_stop()


def select_scenario(requested: str | None) -> Scenario:
    if requested:
        key = ALIASES.get(requested, requested)
        if key not in SCENARIOS:
            raise ValueError(f"Unknown scenario '{requested}'. Use --list-scenarios.")
        return SCENARIOS[key]

    if not sys.stdin.isatty():
        return SCENARIOS["normal"]

    print("\nChoose a virtual patient case:")
    options = list(SCENARIOS.values())
    for index, scenario in enumerate(options, start=1):
        print(f"  {index}. {scenario.title} - {scenario.description}")
    while True:
        choice = input("Case number [1]: ").strip() or "1"
        if choice.isdigit() and 1 <= int(choice) <= len(options):
            return options[int(choice) - 1]
        print("Please enter one of the listed numbers.")


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Stream a synthetic patient through AscultiCor MQTT.")
    parser.add_argument("--config", help="JSON file downloaded/generated when the virtual device is created.")
    parser.add_argument("--scenario", choices=sorted(set(SCENARIOS) | set(ALIASES)))
    parser.add_argument("--seed", type=int, default=2026, help="Deterministic signal seed.")
    parser.add_argument("--list-scenarios", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.list_scenarios:
        for scenario in SCENARIOS.values():
            print(f"{scenario.key:20} {scenario.title}: {scenario.description}")
        return 0
    try:
        config = load_config(args.config)
        scenario = select_scenario(args.scenario)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    simulator = AscultiCorSimulator(config, scenario, seed=args.seed)
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    simulator.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
