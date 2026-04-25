"""
ML Inference Engine with Demo Mode support.
Loads trained models from training output directories.
Falls back to deterministic mocks if models are missing.
"""

import os
import json
import numpy as np
from typing import Dict, Any, Optional
import logging
import time
from pathlib import Path
from scipy import signal as scipy_signal

from .preprocessing import (
    PCGPreprocessor,
    PCGSeverityPreprocessor,
    ECGPreprocessor,
    get_preprocessing_version
)

logger = logging.getLogger(__name__)

# ─── Model directories (match training script outputs) ────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent.parent  # cardiosense/
MODELS_DIR   = Path(os.getenv("MODELS_DIR", PROJECT_ROOT / "models"))

# Model 1: XGBoost heart sound classifier
PCG_MODEL_DIR     = MODELS_DIR / "model1_xgboost"
PCG_MODEL_PATH    = PCG_MODEL_DIR / "xgboost_model.pkl"
PCG_ENCODER_PATH  = PCG_MODEL_DIR / "label_encoder.pkl"
PCG_SCALER_PATH   = PCG_MODEL_DIR / "scaler.pkl"

# Model 2: CNN murmur severity (multi-output)
SEVERITY_MODEL_DIR  = MODELS_DIR / "model2_cnn_severity"
SEVERITY_MODEL_PATH = SEVERITY_MODEL_DIR / "best_model.keras"
SEVERITY_CONFIG_PATH = SEVERITY_MODEL_DIR / "config.json"

# Model 3: BiLSTM ECG arrhythmia predictor
ECG_MODEL_DIR     = MODELS_DIR / "model3_bilstm_ecg"
ECG_MODEL_PATH    = ECG_MODEL_DIR / "bilstm_model.keras"
ECG_ENCODER_PATH  = ECG_MODEL_DIR / "label_encoder.pkl"
ECG_CONFIG_PATH   = ECG_MODEL_DIR / "config.json"

# ─── ECG beat-type → AAMI 5-class mapping ─────────────────────────────────────
# Training uses 7 individual beat types from MIT-BIH.
# We map them to the standard AAMI 5-class scheme for clinical reporting.
BEAT_TO_AAMI = {
    'N': 'Normal',
    'L': 'Normal',      # LBBB → superset Normal
    'R': 'Normal',      # RBBB → superset Normal
    'A': 'SVEB',        # Atrial premature → Supraventricular ectopic
    'V': 'VEB',         # PVC → Ventricular ectopic
    'F': 'Fusion',      # Fusion beat
    '/': 'Unknown',     # Paced beat → Unknown/other
}


class InferenceEngine:
    """
    Main inference engine that orchestrates all 3 models.
    
    Graceful degradation: each model loads independently — if one model
    file is missing or fails to load, the other models still work.
    The service will start as long as at least one model is available
    (or demo mode is enabled).
    """

    def __init__(self, enable_demo_mode: bool = True):
        self.enable_demo_mode = enable_demo_mode
        self.demo_mode_active = False

        # Per-model availability tracking
        self.model_status = {
            'pcg_xgboost': {'loaded': False, 'error': None},
            'severity_cnn': {'loaded': False, 'error': None},
            'ecg_bilstm': {'loaded': False, 'error': None},
        }

        # Initialize preprocessors from environment so deployment config can
        # tune capture windows without code edits.
        pcg_sample_rate = int(os.getenv("PCG_SAMPLE_RATE", 22050))
        pcg_target_duration = float(os.getenv("PCG_TARGET_DURATION", 10))
        ecg_sample_rate = int(os.getenv("ECG_SAMPLE_RATE", 360))
        ecg_window_size = int(os.getenv("ECG_WINDOW_SIZE", 300))
        self.ecg_max_windows = int(os.getenv("ECG_MAX_WINDOWS", 12))

        self.pcg_preprocessor = PCGPreprocessor(
            sample_rate=pcg_sample_rate,
            target_duration=pcg_target_duration,
        )
        self.severity_preprocessor = PCGSeverityPreprocessor(
            sample_rate=pcg_sample_rate,
        )
        self.ecg_preprocessor = ECGPreprocessor(
            sample_rate=ecg_sample_rate,
            window_size=ecg_window_size,
        )

        # Placeholders for models and artifacts
        self.pcg_model = None
        self.pcg_label_encoder = None
        self.pcg_scaler = None
        self.severity_model = None
        self.severity_encoders = {}
        self.severity_config = {}
        self.ecg_model = None
        self.ecg_label_encoder = None
        self.ecg_config = {}

        # Load models (each independently)
        self._load_models()

        loaded_count = sum(1 for s in self.model_status.values() if s['loaded'])
        total = len(self.model_status)
        logger.info(
            f"InferenceEngine initialized: {loaded_count}/{total} models loaded, "
            f"demo_mode={self.demo_mode_active}"
        )

    def get_model_status(self) -> Dict[str, Any]:
        """Return per-model availability for the health endpoint."""
        loaded = sum(1 for s in self.model_status.values() if s['loaded'])
        return {
            'models_loaded': loaded,
            'models_total': len(self.model_status),
            'demo_mode': self.demo_mode_active,
            'details': {
                name: {
                    'loaded': info['loaded'],
                    'error': info['error'],
                }
                for name, info in self.model_status.items()
            },
        }

    def _load_models(self):
        """
        Load ML models with per-model isolation.
        
        Each model loads in its own try/except so that a missing or broken
        model file never prevents the remaining models from loading.
        If ALL models fail and demo mode is enabled, falls back to demo.
        If ALL models fail and demo mode is disabled, raises.
        """
        import joblib  # import once

        # ── Model 1: XGBoost PCG classifier ─────────────────
        try:
            if not PCG_MODEL_PATH.exists():
                raise FileNotFoundError(f"PCG model not found: {PCG_MODEL_PATH}")
            
            self.pcg_model = joblib.load(PCG_MODEL_PATH)
            logger.info(f"Loaded PCG model from {PCG_MODEL_PATH}")

            if PCG_ENCODER_PATH.exists():
                self.pcg_label_encoder = joblib.load(PCG_ENCODER_PATH)
                logger.info(f"Loaded PCG label encoder ({list(self.pcg_label_encoder.classes_)})")

            if PCG_SCALER_PATH.exists():
                self.pcg_scaler = joblib.load(PCG_SCALER_PATH)
                logger.info("Loaded PCG feature scaler")

            self.model_status['pcg_xgboost'] = {'loaded': True, 'error': None}

        except Exception as e:
            logger.warning(f"Model 1 (PCG XGBoost) unavailable: {e}")
            self.model_status['pcg_xgboost'] = {'loaded': False, 'error': str(e)}

        # ── Model 2: CNN murmur severity ────────────────────
        try:
            if not SEVERITY_MODEL_PATH.exists():
                raise FileNotFoundError(f"Severity model not found: {SEVERITY_MODEL_PATH}")
            
            from tensorflow import keras
            self.severity_model = keras.models.load_model(str(SEVERITY_MODEL_PATH))
            logger.info(f"Loaded Severity model from {SEVERITY_MODEL_PATH}")

            # Load per-head label encoders
            for pkl in SEVERITY_MODEL_DIR.glob("encoder_*.pkl"):
                key = pkl.stem.replace("encoder_", "")
                self.severity_encoders[key] = joblib.load(pkl)
            logger.info(f"Loaded {len(self.severity_encoders)} severity encoders")

            # Load config
            if SEVERITY_CONFIG_PATH.exists():
                with open(SEVERITY_CONFIG_PATH) as f:
                    self.severity_config = json.load(f)

            self.model_status['severity_cnn'] = {'loaded': True, 'error': None}

        except Exception as e:
            logger.warning(f"Model 2 (Severity CNN) unavailable: {e}")
            self.model_status['severity_cnn'] = {'loaded': False, 'error': str(e)}

        # ── Model 3: BiLSTM ECG predictor ───────────────────
        try:
            if not ECG_MODEL_PATH.exists():
                raise FileNotFoundError(f"ECG model not found: {ECG_MODEL_PATH}")
            
            from tensorflow import keras
            self.ecg_model = keras.models.load_model(str(ECG_MODEL_PATH))
            logger.info(f"Loaded ECG model from {ECG_MODEL_PATH}")

            if ECG_ENCODER_PATH.exists():
                self.ecg_label_encoder = joblib.load(ECG_ENCODER_PATH)
                logger.info(f"Loaded ECG label encoder ({list(self.ecg_label_encoder.classes_)})")

            if ECG_CONFIG_PATH.exists():
                with open(ECG_CONFIG_PATH) as f:
                    self.ecg_config = json.load(f)
                logger.info(f"Loaded ECG config: {self.ecg_config}")

            self.model_status['ecg_bilstm'] = {'loaded': True, 'error': None}

        except Exception as e:
            logger.warning(f"Model 3 (ECG BiLSTM) unavailable: {e}")
            self.model_status['ecg_bilstm'] = {'loaded': False, 'error': str(e)}

        # ── Decide final mode ────────────────────────────────
        any_loaded = any(s['loaded'] for s in self.model_status.values())

        if any_loaded:
            self.demo_mode_active = False
        elif self.enable_demo_mode:
            logger.warning("No models loaded — activating DEMO MODE")
            self.demo_mode_active = True
        else:
            errors = "; ".join(
                f"{k}: {v['error']}" for k, v in self.model_status.items() if v['error']
            )
            raise RuntimeError(f"All models failed to load and demo mode is disabled: {errors}")

    # ─── PCG Prediction ────────────────────────────────────────────────────────

    def predict_pcg(self, audio: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """
        Run PCG classification (Model 1 — XGBoost).

        Returns:
            {
                'label': str,
                'probabilities': dict,
                'model_version': str,
                'preprocessing_version': str,
                'latency_ms': int,
                'demo_mode': bool
            }
        """
        start_time = time.time()

        try:
            # Check model availability
            if not self.demo_mode_active and self.pcg_model is None:
                return {
                    'error': 'PCG model not loaded',
                    'detail': self.model_status['pcg_xgboost'].get('error', 'Unknown'),
                    'model_name': 'pcg_xgboost_classifier',
                    'demo_mode': False,
                }

            # Preprocess
            features = self.pcg_preprocessor.process(audio, original_sr=sample_rate)
            feature_array = self.pcg_preprocessor.features_to_array(features)
            feature_array = feature_array.reshape(1, -1)

            # Scale features if scaler is available
            if self.pcg_scaler is not None:
                feature_array = self.pcg_scaler.transform(feature_array)

            # Predict
            if self.demo_mode_active:
                result = self._demo_pcg_prediction(audio)
            else:
                probs = self.pcg_model.predict_proba(feature_array)[0]

                # Use the loaded label encoder for class names
                if self.pcg_label_encoder is not None:
                    classes = list(self.pcg_label_encoder.classes_)
                else:
                    classes = ['normal', 'murmur', 'artifact', 'extrahls']

                label = classes[np.argmax(probs)]

                result = {
                    'label': label.capitalize(),
                    'probabilities': {
                        cls.capitalize(): float(probs[i])
                        for i, cls in enumerate(classes)
                    }
                }

            # Add metadata
            latency = int((time.time() - start_time) * 1000)
            result.update({
                'model_name': 'pcg_xgboost_classifier',
                'model_version': 'v1.0.0' if not self.demo_mode_active else 'demo',
                'preprocessing_version': get_preprocessing_version(),
                'latency_ms': latency,
                'demo_mode': self.demo_mode_active
            })

            logger.info(f"PCG prediction: {result['label']} ({latency}ms)")
            return result

        except Exception as e:
            logger.error(f"PCG prediction error: {e}")
            raise

    # ─── Murmur Severity Prediction ────────────────────────────────────────────

    def predict_murmur_severity(
        self,
        audio: np.ndarray,
        sample_rate: int
    ) -> Optional[Dict[str, Any]]:
        """
        Run murmur severity analysis (Model 2 — CNN multi-output).
        Returns 6 classification heads using trained label encoders.
        """
        start_time = time.time()

        try:
            # Check model availability
            if not self.demo_mode_active and self.severity_model is None:
                return {
                    'error': 'Severity model not loaded',
                    'detail': self.model_status['severity_cnn'].get('error', 'Unknown'),
                    'model_name': 'murmur_severity_cnn',
                    'demo_mode': False,
                }

            # Preprocess
            spectrogram = self.severity_preprocessor.process(audio, original_sr=sample_rate)

            # Add batch and channel dimensions
            spectrogram = np.expand_dims(spectrogram, axis=0)   # Batch
            spectrogram = np.expand_dims(spectrogram, axis=-1)  # Channel

            # Predict
            if self.demo_mode_active:
                result = self._demo_severity_prediction()
            else:
                predictions = self.severity_model.predict(spectrogram)

                # Use the trained label encoders for each head
                label_keys = self.severity_config.get(
                    'label_keys',
                    list(self.severity_encoders.keys())
                )

                result = {}
                for i, key in enumerate(label_keys):
                    if isinstance(predictions, dict):
                        pred_arr = predictions[key][0]
                    elif isinstance(predictions, list):
                        pred_arr = predictions[i][0]
                    else:
                        pred_arr = predictions[0]

                    encoder = self.severity_encoders.get(key)
                    if encoder is not None:
                        labels = list(encoder.classes_)
                    else:
                        labels = [f"class_{j}" for j in range(len(pred_arr))]

                    result[key] = self._parse_head(pred_arr, labels)

            # Add metadata
            latency = int((time.time() - start_time) * 1000)
            result.update({
                'model_name': 'murmur_severity_cnn',
                'model_version': 'v1.0.0' if not self.demo_mode_active else 'demo',
                'preprocessing_version': get_preprocessing_version(),
                'latency_ms': latency,
                'demo_mode': self.demo_mode_active
            })

            logger.info(f"Severity prediction completed ({latency}ms)")
            return result

        except Exception as e:
            logger.error(f"Severity prediction error: {e}")
            raise

    # ─── ECG Prediction ────────────────────────────────────────────────────────

    def predict_ecg(self, ecg: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """
        Run ECG prediction (Model 3 — BiLSTM).
        Maps 7 training beat types to 5 AAMI clinical classes.

        Returns:
            {
                'prediction': str,       # AAMI class name
                'beat_type': str,        # raw beat type from model
                'confidence': float,
                'probabilities': dict,   # AAMI class probabilities
                'raw_probabilities': dict, # per beat-type probabilities
            }
        """
        start_time = time.time()

        try:
            # Check model availability
            if not self.demo_mode_active and self.ecg_model is None:
                return {
                    'error': 'ECG model not loaded',
                    'detail': self.model_status['ecg_bilstm'].get('error', 'Unknown'),
                    'model_name': 'ecg_bilstm_predictor',
                    'demo_mode': False,
                }

            prepared_signal = self._prepare_ecg_signal(ecg, sample_rate)
            ecg_windows = self._build_ecg_windows(prepared_signal)
            processed_batch = self._format_ecg_windows(ecg_windows)

            # Predict
            if self.demo_mode_active:
                result = self._demo_ecg_prediction(ecg)
            else:
                prediction = self.ecg_model.predict(processed_batch, verbose=0)
                mean_prediction = np.mean(prediction, axis=0)

                # Get beat-type classes from trained label encoder
                if self.ecg_label_encoder is not None:
                    beat_classes = list(self.ecg_label_encoder.classes_)
                else:
                    beat_classes = self.ecg_config.get(
                        'classes', ['N', 'V', 'L', 'R', 'A', '/', 'F']
                    )

                pred_idx = np.argmax(mean_prediction)
                beat_type = beat_classes[pred_idx]

                # Raw probabilities per beat type
                raw_probs = {
                    bt: float(mean_prediction[i])
                    for i, bt in enumerate(beat_classes)
                }

                # Map to AAMI 5-class scheme
                aami_label = BEAT_TO_AAMI.get(beat_type, 'Unknown')
                aami_probs = self._aggregate_aami_probs(mean_prediction, beat_classes)
                aami_confidence = float(aami_probs.get(aami_label, 0.0))
                heart_rate_bpm = self._estimate_heart_rate(
                    prepared_signal,
                    self.ecg_preprocessor.sample_rate
                )

                result = {
                    'prediction': aami_label,
                    'beat_type': beat_type,
                    'confidence': aami_confidence,
                    'probabilities': aami_probs,
                    'raw_probabilities': raw_probs,
                    'heart_rate_bpm': heart_rate_bpm,
                    'windows_analyzed': int(processed_batch.shape[0]),
                }

            # Add metadata
            latency = int((time.time() - start_time) * 1000)
            result.update({
                'model_name': 'ecg_bilstm_predictor',
                'model_version': 'v1.0.0' if not self.demo_mode_active else 'demo',
                'preprocessing_version': get_preprocessing_version(),
                'latency_ms': latency,
                'demo_mode': self.demo_mode_active
            })

            logger.info(f"ECG prediction: {result['prediction']} ({latency}ms)")
            return result

        except Exception as e:
            logger.error(f"ECG prediction error: {e}")
            raise

    # ─── Helpers ───────────────────────────────────────────────────────────────

    def _aggregate_aami_probs(
        self,
        raw_probs: np.ndarray,
        beat_classes: list
    ) -> Dict[str, float]:
        """
        Aggregate per-beat-type probabilities into AAMI 5-class probabilities.
        Multiple beat types map to the same AAMI class, so we sum them.
        """
        aami_probs = {'Normal': 0.0, 'SVEB': 0.0, 'VEB': 0.0, 'Fusion': 0.0, 'Unknown': 0.0}
        for i, bt in enumerate(beat_classes):
            aami_class = BEAT_TO_AAMI.get(bt, 'Unknown')
            aami_probs[aami_class] += float(raw_probs[i])
        return aami_probs

    def _prepare_ecg_signal(self, ecg: np.ndarray, original_sr: int) -> np.ndarray:
        """Apply ECG preprocessing stages while preserving the full recording."""
        prepared = ecg.astype(np.float32)

        if original_sr and original_sr != self.ecg_preprocessor.sample_rate:
            prepared = scipy_signal.resample(
                prepared,
                int(len(prepared) * self.ecg_preprocessor.sample_rate / original_sr)
            )

        prepared = self.ecg_preprocessor._bandpass_filter(prepared)
        prepared = self.ecg_preprocessor._baseline_correction(prepared)
        prepared = self.ecg_preprocessor._denoise(prepared)
        return prepared

    def _build_ecg_windows(self, ecg: np.ndarray) -> np.ndarray:
        """Slice the full ECG into a bounded set of overlapping windows."""
        window_size = self.ecg_preprocessor.window_size
        stride = max(1, window_size // 2)

        if ecg.size <= window_size:
            padded = np.pad(ecg, (0, max(0, window_size - ecg.size)), mode='edge')
            return np.expand_dims(padded[:window_size], axis=0)

        starts = list(range(0, ecg.size - window_size + 1, stride))
        if not starts:
            starts = [0]

        if len(starts) > self.ecg_max_windows:
            selected = np.linspace(0, len(starts) - 1, self.ecg_max_windows, dtype=int)
            starts = [starts[idx] for idx in selected]

        windows = [ecg[start:start + window_size] for start in starts]
        return np.stack(windows, axis=0)

    def _format_ecg_windows(self, ecg_windows: np.ndarray) -> np.ndarray:
        """Normalize each ECG window and format it for the BiLSTM input."""
        normalized = []
        for window in ecg_windows:
            normalized_window = self.ecg_preprocessor._normalize(window)
            normalized.append(normalized_window)

        batch = np.stack(normalized, axis=0).astype(np.float32)
        batch = np.expand_dims(batch, axis=-1)
        batch = np.pad(batch, ((0, 0), (0, 0), (0, 1)), 'constant')
        return batch

    def _estimate_heart_rate(self, ecg: np.ndarray, sample_rate: int) -> Optional[float]:
        """Estimate heart rate from R-peak intervals on the preprocessed ECG."""
        if ecg.size < sample_rate * 2:
            return None

        signal_energy = np.abs(ecg)
        prominence = max(np.std(signal_energy) * 0.8, 0.05)
        min_distance = max(1, int(sample_rate * 0.3))
        peaks, _ = scipy_signal.find_peaks(
            signal_energy,
            distance=min_distance,
            prominence=prominence,
        )

        if peaks.size < 2:
            return None

        rr_intervals = np.diff(peaks) / float(sample_rate)
        rr_intervals = rr_intervals[(rr_intervals >= 0.3) & (rr_intervals <= 2.0)]
        if rr_intervals.size == 0:
            return None

        bpm = 60.0 / np.median(rr_intervals)
        return round(float(bpm), 1)

    def _parse_head(self, probs: np.ndarray, labels: list) -> Dict[str, Any]:
        """Parse multi-class head output."""
        pred_idx = np.argmax(probs)
        return {
            'predicted': labels[pred_idx],
            'probabilities': {
                labels[i]: float(probs[i])
                for i in range(len(labels))
            }
        }

    # ========== DEMO MODE PREDICTIONS ==========

    def _demo_pcg_prediction(self, audio: np.ndarray, scenario: str = 'normal') -> Dict[str, Any]:
        """Deterministic demo PCG prediction."""
        scenario_labels = {
            'normal': 'Normal',
            'tachycardia': 'Normal',
            'bradycardia': 'Normal',
            'systolic_murmur': 'Murmur',
            'diastolic_murmur': 'Murmur',
            'combined_murmur': 'Murmur',
            'abnormal_ecg': 'Normal',
            'afib': 'Normal',
        }

        expected_label = scenario_labels.get(scenario, 'Normal')

        if expected_label == 'Murmur':
            return {
                'label': 'Murmur',
                'probabilities': {
                    'Normal': 0.20,
                    'Murmur': 0.70,
                    'Artifact': 0.10
                }
            }
        elif expected_label == 'Artifact':
            return {
                'label': 'Artifact',
                'probabilities': {
                    'Normal': 0.15,
                    'Murmur': 0.20,
                    'Artifact': 0.65
                }
            }
        else:
            return {
                'label': 'Normal',
                'probabilities': {
                    'Normal': 0.75,
                    'Murmur': 0.15,
                    'Artifact': 0.10
                }
            }

    def _demo_severity_prediction(self) -> Dict[str, Any]:
        """Deterministic demo severity prediction."""
        return {
            'murmur_locations': {
                'predicted': 'MV',
                'probabilities': {
                    'AV': 0.10, 'MV': 0.45, 'PV': 0.12, 'TV': 0.08,
                    'Left heart': 0.08, 'Right heart': 0.05,
                    'AV+Right': 0.04, 'MV+Right': 0.03,
                    'Multiple (3+)': 0.03, 'Other': 0.02
                }
            },
            'systolic_timing': {
                'predicted': 'Mid-systolic',
                'probabilities': {
                    'Early-systolic': 0.10, 'Mid-systolic': 0.50,
                    'Late-systolic': 0.15, 'Holosystolic': 0.20,
                    'Unknown': 0.05
                }
            },
            'systolic_shape': {
                'predicted': 'Crescendo-decrescendo',
                'probabilities': {
                    'Crescendo': 0.15, 'Decrescendo': 0.18,
                    'Crescendo-decrescendo': 0.50, 'Plateau': 0.12,
                    'Unknown': 0.05
                }
            },
            'systolic_grading': {
                'predicted': 'III/VI',
                'probabilities': {
                    'I/VI': 0.05, 'II/VI': 0.12, 'III/VI': 0.38,
                    'IV/VI': 0.22, 'V/VI': 0.10, 'VI/VI': 0.05,
                    'Unknown': 0.08
                }
            },
            'systolic_pitch': {
                'predicted': 'Medium',
                'probabilities': {
                    'Low': 0.18, 'Medium': 0.50, 'High': 0.25,
                    'Unknown': 0.07
                }
            },
            'systolic_quality': {
                'predicted': 'Blowing',
                'probabilities': {
                    'Blowing': 0.48, 'Harsh': 0.28,
                    'Musical': 0.15, 'Unknown': 0.09
                }
            }
        }

    def _demo_ecg_prediction(self, ecg: np.ndarray) -> Dict[str, Any]:
        """Deterministic demo ECG prediction (AAMI 5-class)."""
        variance = np.var(ecg)

        if variance > 2.0:
            return {
                'prediction': 'VEB',
                'beat_type': 'V',
                'confidence': 0.68,
                'heart_rate_bpm': 96.0,
                'windows_analyzed': 1,
                'probabilities': {
                    'Normal': 0.12, 'SVEB': 0.10,
                    'VEB': 0.68, 'Fusion': 0.06,
                    'Unknown': 0.04
                },
                'raw_probabilities': {'V': 0.68, 'N': 0.12, 'A': 0.10, 'F': 0.06, '/': 0.04}
            }
        elif variance > 1.0:
            return {
                'prediction': 'SVEB',
                'beat_type': 'A',
                'confidence': 0.62,
                'heart_rate_bpm': 88.0,
                'windows_analyzed': 1,
                'probabilities': {
                    'Normal': 0.20, 'SVEB': 0.62,
                    'VEB': 0.08, 'Fusion': 0.05,
                    'Unknown': 0.05
                },
                'raw_probabilities': {'A': 0.62, 'N': 0.20, 'V': 0.08, 'F': 0.05, '/': 0.05}
            }
        else:
            return {
                'prediction': 'Normal',
                'beat_type': 'N',
                'confidence': 0.81,
                'heart_rate_bpm': 72.0,
                'windows_analyzed': 1,
                'probabilities': {
                    'Normal': 0.81, 'SVEB': 0.08,
                    'VEB': 0.05, 'Fusion': 0.03,
                    'Unknown': 0.03
                },
                'raw_probabilities': {'N': 0.81, 'A': 0.08, 'V': 0.05, 'F': 0.03, '/': 0.03}
            }
