"""
Inference service unit tests — F18 audit fix.

Covers: preprocessing correctness, SessionBuffer accounting,
        demo mode inference, checksum determinism.

Run with:
  cd inference
  python -m pytest tests/ -v --tb=short --cov=app
"""

import hashlib
import os
import sys

import numpy as np
import pytest

# Allow importing app package from `inference/` root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def test_preprocessing_version():
    from app.preprocessing import get_preprocessing_version
    assert get_preprocessing_version() == "v1.0.0"


def test_pcg_preprocessor_output_shape():
    from app.preprocessing import PCGPreprocessor
    TARGET_DURATION = 1.0
    SAMPLE_RATE = 22050
    pp = PCGPreprocessor(sample_rate=SAMPLE_RATE, target_duration=TARGET_DURATION)
    # One second of noise
    signal = np.random.randn(SAMPLE_RATE).astype(np.float32)
    features = pp.process(signal, original_sr=SAMPLE_RATE)
    arr = pp.features_to_array(features)
    assert arr.ndim == 1, "Feature vector must be 1-D"
    assert arr.shape[0] > 0, "Feature vector must be non-empty"
    assert not np.any(np.isnan(arr)), "Feature vector must not contain NaN"


def test_pcg_preprocessor_deterministic():
    """Same input must produce identical features (no randomness)."""
    from app.preprocessing import PCGPreprocessor
    SAMPLE_RATE = 22050
    pp = PCGPreprocessor(sample_rate=SAMPLE_RATE, target_duration=1.0)
    signal = np.ones(SAMPLE_RATE, dtype=np.float32) * 0.5
    arr1 = pp.features_to_array(pp.process(signal, original_sr=SAMPLE_RATE))
    arr2 = pp.features_to_array(pp.process(signal, original_sr=SAMPLE_RATE))
    np.testing.assert_array_equal(arr1, arr2, err_msg="PCG preprocessing must be deterministic")


def test_ecg_preprocessor_output_shape():
    from app.preprocessing import ECGPreprocessor
    SAMPLE_RATE = 500
    WINDOW_SIZE = 500
    ecg = ECGPreprocessor(sample_rate=SAMPLE_RATE, window_size=WINDOW_SIZE)
    # One second of sine wave
    signal = np.sin(np.linspace(0, 10 * np.pi, 1000)).astype(np.float32)
    result = ecg.process(signal, original_sr=SAMPLE_RATE)
    assert result.shape == (WINDOW_SIZE,), f"Expected shape ({WINDOW_SIZE},), got {result.shape}"
    assert not np.any(np.isnan(result)), "ECG output must not contain NaN"


def test_ecg_preprocessor_deterministic():
    from app.preprocessing import ECGPreprocessor
    SAMPLE_RATE = 500
    ecg = ECGPreprocessor(sample_rate=SAMPLE_RATE, window_size=500)
    signal = np.sin(np.linspace(0, 10 * np.pi, 1000)).astype(np.float32)
    r1 = ecg.process(signal, original_sr=SAMPLE_RATE)
    r2 = ecg.process(signal, original_sr=SAMPLE_RATE)
    np.testing.assert_array_equal(r1, r2, err_msg="ECG preprocessing must be deterministic")


# ---------------------------------------------------------------------------
# SessionBuffer
# ---------------------------------------------------------------------------

def test_session_buffer_duration_calculation():
    """2 bytes/sample × N samples → duration = N / sample_rate seconds."""
    from app.mqtt_handler import SessionBuffer
    SAMPLE_RATE = 22050
    buf = SessionBuffer(
        session_id="00000000-0000-0000-0000-000000000001",
        org_id="00000000-0000-0000-0000-000000000002",
        device_id="00000000-0000-0000-0000-000000000003",
        modality='pcg',
        config={'sample_rate_hz': SAMPLE_RATE}
    )
    # 1 second of int16 = 22050 * 2 bytes
    buf.add_chunk(bytes(SAMPLE_RATE * 2))
    duration = buf.get_duration()
    assert abs(duration - 1.0) < 0.01, f"Expected duration ≈ 1.0s, got {duration:.4f}s"


def test_session_buffer_accumulates_chunks():
    from app.mqtt_handler import SessionBuffer
    buf = SessionBuffer(
        session_id="00000000-0000-0000-0000-000000000001",
        org_id="00000000-0000-0000-0000-000000000002",
        device_id="00000000-0000-0000-0000-000000000003",
        modality='ecg',
        config={'sample_rate_hz': 500}
    )
    # Each chunk: 500 int16 samples * 2 bytes/sample = 1000 bytes = 1.0s at 500 Hz
    # 3 chunks → 3.0s total
    for _ in range(3):
        buf.add_chunk(bytes(500 * 2))  # 500 int16 samples = 1.0s at 500 Hz
    duration = buf.get_duration()
    assert abs(duration - 3.0) < 0.01, f"Expected 3.0s, got {duration:.4f}s"


# ---------------------------------------------------------------------------
# Demo-mode inference
# ---------------------------------------------------------------------------

def test_demo_pcg_inference_keys():
    """Demo mode must return the expected result dictionary keys."""
    from app.inference import InferenceEngine
    engine = InferenceEngine(enable_demo_mode=True)
    signal = np.random.randn(22050).astype(np.float32)
    result = engine.predict_pcg(signal, sample_rate=22050)
    required_keys = {'label', 'probabilities', 'model_name', 'model_version',
                     'preprocessing_version', 'latency_ms', 'demo_mode'}
    assert required_keys.issubset(result.keys()), (
        f"Missing keys: {required_keys - result.keys()}"
    )
    assert result['demo_mode'] is True
    assert result['label'] in ('Normal', 'Murmur', 'Artifact')


def test_demo_ecg_inference_keys():
    """Demo mode must return the expected ECG result dictionary keys."""
    from app.inference import InferenceEngine
    engine = InferenceEngine(enable_demo_mode=True)
    signal = np.sin(np.linspace(0, 10 * np.pi, 500)).astype(np.float32)
    result = engine.predict_ecg(signal, sample_rate=500)
    required_keys = {'prediction', 'confidence', 'model_name', 'model_version',
                     'preprocessing_version', 'latency_ms', 'demo_mode'}
    assert required_keys.issubset(result.keys()), (
        f"Missing keys: {required_keys - result.keys()}"
    )
    assert result['demo_mode'] is True
    assert result['prediction'] in ('Normal', 'Abnormal')


# ---------------------------------------------------------------------------
# SupabaseClient.compute_checksum
# ---------------------------------------------------------------------------

def test_checksum_determinism():
    from app.supabase_client import SupabaseClient
    data = b"test payload for checksum determinism check"
    h1 = SupabaseClient.compute_checksum(data)
    h2 = SupabaseClient.compute_checksum(data)
    assert h1 == h2, "checksum must be deterministic"


def test_checksum_value():
    import hashlib
    from app.supabase_client import SupabaseClient
    data = b"hello"
    # compute_checksum uses SHA-256 (not MD5)
    expected = hashlib.sha256(data).hexdigest()
    result = SupabaseClient.compute_checksum(data)
    assert result == expected, f"Expected SHA-256 {expected}, got {result}"


def test_checksum_different_data():
    from app.supabase_client import SupabaseClient
    assert SupabaseClient.compute_checksum(b"a") != SupabaseClient.compute_checksum(b"b")
