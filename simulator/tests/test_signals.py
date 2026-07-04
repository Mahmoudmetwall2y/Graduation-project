import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np


MODULE_PATH = Path(__file__).resolve().parents[1] / "asculticor_patient_simulator.py"
SPEC = importlib.util.spec_from_file_location("patient_simulator", MODULE_PATH)
simulator = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = simulator
SPEC.loader.exec_module(simulator)


class SignalGenerationTests(unittest.TestCase):
    def test_ecg_has_expected_shape_type_and_visible_qrs(self):
        signal = simulator.generate_ecg(simulator.SCENARIOS["normal"], 10, seed=1)
        self.assertEqual(signal.dtype, np.dtype("int16"))
        self.assertEqual(signal.size, 10 * simulator.ECG_SAMPLE_RATE)
        self.assertGreater(int(np.ptp(signal.astype(np.int32))), 800)

    def test_pcg_has_expected_shape_and_murmur_has_more_between_sound_energy(self):
        normal = simulator.generate_pcg(simulator.SCENARIOS["normal"], 10, seed=2)
        murmur = simulator.generate_pcg(simulator.SCENARIOS["systolic_murmur"], 10, seed=2)
        self.assertEqual(normal.size, 10 * simulator.PCG_SAMPLE_RATE)
        self.assertEqual(murmur.dtype, np.dtype("int16"))
        self.assertGreater(float(np.mean(murmur.astype(np.float64) ** 2)),
                           float(np.mean(normal.astype(np.float64) ** 2)) * 1.05)
        self.assertLess(int(np.max(np.abs(normal.astype(np.int32)))), 22_000)
        self.assertLess(int(np.max(np.abs(murmur.astype(np.int32)))), 22_000)

    def test_normal_pcg_is_heart_sound_dominant_not_noise_dominant(self):
        signal = simulator.generate_pcg(simulator.SCENARIOS["normal"], 10, seed=3).astype(np.float64)
        signal /= max(float(np.max(np.abs(signal))), 1.0)
        spectrum = np.fft.rfft(signal)
        freqs = np.fft.rfftfreq(signal.size, d=1 / simulator.PCG_SAMPLE_RATE)
        heart_band = np.mean(np.abs(spectrum[(freqs >= 35) & (freqs <= 190)]) ** 2)
        high_band = np.mean(np.abs(spectrum[(freqs >= 450) & (freqs <= 2_000)]) ** 2)
        self.assertGreater(float(heart_band), float(high_band) * 10)

    def test_generation_is_reproducible(self):
        first = simulator.generate_ecg(simulator.SCENARIOS["irregular_rhythm"], 3, seed=44)
        second = simulator.generate_ecg(simulator.SCENARIOS["irregular_rhythm"], 3, seed=44)
        np.testing.assert_array_equal(first, second)

    def test_credentials_response_can_be_loaded_directly(self):
        config = simulator.SimulatorConfig.from_mapping({"credentials": {
            "mqtt_host": "example.com", "mqtt_port": 8883, "mqtt_tls": True,
            "mqtt_user": "device_user", "mqtt_pass": "secret",
            "org_id": "org", "device_id": "device",
        }})
        self.assertEqual(config.mqtt_host, "example.com")
        self.assertTrue(config.mqtt_tls)


if __name__ == "__main__":
    unittest.main()
