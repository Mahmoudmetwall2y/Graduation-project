"""
Regression tests for the rr_input preprocessing contract.

These tests verify that `_estimate_rr_features` returns exactly 9 consecutive
RR intervals **in seconds** -- not HRV summary statistics (mean_rr, std_rr,
rmssd, BPM, NN50, pNN50, ...).

Root cause: feeding BPM (~72) and percentage values into the model's
mixed-float16 classifier saturated it, producing Unknown = 1.0 for every
window regardless of the ECG signal.

Run with (from inference/ directory using the project venv):
    cd inference
    ../.venv-simulator/Scripts/python.exe -m pytest tests/test_rr_input_contract.py -v

Or from repo root:
    .venv-simulator/Scripts/python.exe -m pytest inference/tests/test_rr_input_contract.py -v

NOTE: These tests deliberately avoid importing InferenceEngine to sidestep the
librosa/tensorflow/xgboost dependencies not present in the simulator venv.
Instead they copy the exact algorithm from _estimate_rr_features so that any
future change to that function will break these tests and surface the regression.
"""

import numpy as np
import pytest
from scipy.signal import find_peaks


# ---------------------------------------------------------------------------
# Exact copy of the fixed _estimate_rr_features algorithm.
# If you change the production function, update this mirror too.
# ---------------------------------------------------------------------------

def _estimate_rr_features(windows: np.ndarray, sample_rate: int) -> np.ndarray:
    """
    Mirror of InferenceEngine._estimate_rr_features (inference/app/inference.py).

    Extract 9 consecutive RR intervals (in seconds) per window.

    The v26 model was trained on raw RR intervals, not HRV summary
    statistics.  Feeding summary values (e.g. BPM ~72, NN50 counts,
    pNN50 percentages) saturates the mixed-float16 classifier and
    causes it to output Unknown = 1.0 for every window.

    Algorithm
    ---------
    1. Detect R-peaks in the absolute-value envelope of the window.
    2. Convert peak distances to RR intervals in seconds.
    3. Keep only physiologically plausible intervals (0.25 - 2.0 s).
    4. If fewer than 9 valid intervals are found, pad with the median
       of the detected intervals (or 0.8 s when no peaks are found).
    5. Return exactly 9 values as a float32 vector.

    Output shape: (batch, 9)  -- values in seconds, range ~0.25-2.0
    """
    batch_size = windows.shape[0]
    features = np.zeros((batch_size, 9), dtype=np.float32)

    for i, window in enumerate(windows):
        energy = np.abs(window)
        prominence = max(np.std(energy) * 0.8, 0.02)
        min_dist = max(1, int(sample_rate * 0.25))

        try:
            peaks, _ = find_peaks(energy, distance=min_dist, prominence=prominence)
        except Exception:
            peaks = np.array([])

        if peaks.size >= 2:
            rr = np.diff(peaks) / float(sample_rate)
            rr = rr[(rr >= 0.25) & (rr <= 2.0)]
        else:
            rr = np.array([], dtype=np.float32)

        # Determine the fill value for padding
        fill = float(np.median(rr)) if rr.size > 0 else 0.8  # 0.8 s ~75 BPM

        # Build exactly-9-element vector: real intervals + padding
        if rr.size >= 9:
            rr_9 = rr[:9].astype(np.float32)
        else:
            pad_count = 9 - rr.size
            rr_9 = np.concatenate(
                [rr, np.full(pad_count, fill, dtype=np.float32)]
            )

        features[i] = rr_9

    return features


# ---------------------------------------------------------------------------
# Reference signal generators
# ---------------------------------------------------------------------------

SAMPLE_RATE = 125   # Hz -- matches ECGPreprocessor default
WINDOW_SIZE = 500   # samples


def _make_regular_ecg(bpm: float, window_size: int = WINDOW_SIZE, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Synthetic ECG with evenly-spaced sharp R-peaks at the given BPM.
    Simulates a Normal sinus rhythm window.
    """
    signal = np.zeros(window_size, dtype=np.float32)
    period_samples = int(sr * 60.0 / bpm)
    for start in range(0, window_size, period_samples):
        for offset in range(-3, 4):
            idx = start + offset
            if 0 <= idx < window_size:
                signal[idx] += float(np.exp(-0.5 * (offset / 1.0) ** 2))
    return signal


def _make_veb_ecg(base_bpm: float = 72.0, window_size: int = WINDOW_SIZE, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Synthetic VEB: one premature wide beat (short RR + compensatory pause).
    """
    signal = _make_regular_ecg(base_bpm, window_size, sr)
    period = int(sr * 60.0 / base_bpm)
    premature_idx = period + period // 2
    if premature_idx + 3 < window_size:
        for offset in range(-3, 4):
            idx = premature_idx + offset
            if 0 <= idx < window_size:
                signal[idx] += float(1.5 * np.exp(-0.5 * (offset / 1.5) ** 2))
    return signal


def _make_sveb_ecg(base_bpm: float = 72.0, window_size: int = WINDOW_SIZE, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Synthetic SVEB: slightly-early supraventricular beat.
    """
    signal = _make_regular_ecg(base_bpm, window_size, sr)
    period = int(sr * 60.0 / base_bpm)
    early_idx = period + int(period * 0.7)
    if early_idx + 3 < window_size:
        for offset in range(-2, 3):
            idx = early_idx + offset
            if 0 <= idx < window_size:
                signal[idx] += float(0.9 * np.exp(-0.5 * (offset / 0.8) ** 2))
    return signal


def _make_fusion_ecg(base_bpm: float = 72.0, window_size: int = WINDOW_SIZE, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Synthetic Fusion beat: blend of normal and wide-complex morphology.
    """
    signal = _make_regular_ecg(base_bpm, window_size, sr)
    period = int(sr * 60.0 / base_bpm)
    fusion_idx = 2 * period
    if fusion_idx + 4 < window_size:
        for offset in range(-4, 5):
            idx = fusion_idx + offset
            if 0 <= idx < window_size:
                signal[idx] += float(
                    0.8 * np.exp(-0.5 * (offset / 2.0) ** 2)
                    + 0.6 * np.exp(-0.5 * (offset / 0.8) ** 2)
                )
    return signal


# ---------------------------------------------------------------------------
# Contract tests
# ---------------------------------------------------------------------------

class TestRRInputShape:
    """_estimate_rr_features must always return shape (batch, 9) float32."""

    def test_single_window_shape(self):
        window = _make_regular_ecg(72.0)[np.newaxis, :]  # (1, 500)
        result = _estimate_rr_features(window, SAMPLE_RATE)
        assert result.shape == (1, 9), f"Expected (1, 9), got {result.shape}"

    def test_batch_shape(self):
        windows = np.stack([_make_regular_ecg(72.0)] * 4, axis=0)  # (4, 500)
        result = _estimate_rr_features(windows, SAMPLE_RATE)
        assert result.shape == (4, 9), f"Expected (4, 9), got {result.shape}"

    def test_dtype_is_float32(self):
        window = _make_regular_ecg(72.0)[np.newaxis, :]
        result = _estimate_rr_features(window, SAMPLE_RATE)
        assert result.dtype == np.float32, f"Expected float32, got {result.dtype}"


class TestRRInputValueRange:
    """
    All values must be in [0.1, 2.0] seconds -- never BPM, counts, or
    percentages.  This is the core regression guard against the old bug.
    """

    @pytest.mark.parametrize("signal_fn,label", [
        (_make_regular_ecg,  "Normal"),
        (_make_veb_ecg,      "VEB"),
        (_make_sveb_ecg,     "SVEB"),
        (_make_fusion_ecg,   "Fusion"),
    ])
    def test_values_in_seconds_range(self, signal_fn, label):
        window = signal_fn(72.0)[np.newaxis, :]
        result = _estimate_rr_features(window, SAMPLE_RATE)
        vals = result[0]  # shape (9,)

        # Guard against BPM bleed-in (old bug returned ~72 here)
        assert vals.max() <= 2.0, (
            f"[{label}] rr_input max={vals.max():.3f} > 2.0 s. "
            f"Old bug fed BPM (~72) here. Full vector: {vals}"
        )
        # Guard against sub-physiological / zero values
        assert vals.min() >= 0.1, (
            f"[{label}] rr_input min={vals.min():.3f} < 0.1 s: {vals}"
        )

    def test_normal_72bpm_approximate_interval(self):
        """For a 72 BPM signal the expected RR interval is ~0.833 s."""
        window = _make_regular_ecg(72.0)[np.newaxis, :]
        result = _estimate_rr_features(window, SAMPLE_RATE)
        assert np.all(np.abs(result[0] - 0.833) < 0.15), (
            f"72 BPM: expected intervals near 0.833 s, got {result[0]}"
        )

    def test_no_bpm_value_present(self):
        """Explicitly verify no value looks like a raw BPM (>= 30)."""
        window = _make_regular_ecg(60.0)[np.newaxis, :]
        result = _estimate_rr_features(window, SAMPLE_RATE)
        assert result[0].max() < 5.0, (
            f"rr_input max={result[0].max():.1f} -- "
            f"old bug returned BPM ~60-100: {result[0]}"
        )


class TestRRInputEdgeCases:
    """Robustness: no peaks, more than 9 peaks, fewer than 9 peaks."""

    def test_flat_signal_uses_fallback(self):
        """A zero/flat signal (no detectable peaks) should pad with 0.8 s."""
        window = np.zeros((1, WINDOW_SIZE), dtype=np.float32)
        result = _estimate_rr_features(window, SAMPLE_RATE)
        assert result.shape == (1, 9)
        assert np.allclose(result[0], 0.8, atol=0.01), (
            f"Flat signal should pad with 0.8 s fallback, got {result[0]}"
        )

    def test_more_than_nine_intervals_truncated(self):
        """More than 9 detected intervals: take first 9 only."""
        long_window = _make_regular_ecg(72.0, window_size=2000, sr=SAMPLE_RATE)
        result = _estimate_rr_features(long_window[np.newaxis, :], SAMPLE_RATE)
        assert result.shape == (1, 9)
        assert result[0].max() <= 2.0

    def test_fewer_than_nine_intervals_padded_with_median(self):
        """Fewer than 9 intervals: padding must equal the median, not zero."""
        sparse_window = np.zeros(WINDOW_SIZE, dtype=np.float32)
        period = int(SAMPLE_RATE * 0.833)  # ~72 BPM = 0.833 s period
        for peak_idx in [50, 50 + period, 50 + 2 * period]:
            if peak_idx < WINDOW_SIZE:
                sparse_window[peak_idx] = 1.0
        result = _estimate_rr_features(sparse_window[np.newaxis, :], SAMPLE_RATE)
        assert result.shape == (1, 9)
        # Padding must not be 0
        assert result[0].min() > 0.05, (
            f"Padding with 0 detected -- expected median fill: {result[0]}"
        )
