"""
ML Inference Engine with Model Registry integration.

Loads trained models using the central ModelRegistry (model_registry.py).
Each model is loaded independently — a failed or disabled model never
prevents the remaining models from working.

Model slots
-----------
  Model 1 – pcg_xgboost   : XGBoost PCG heart-sound classifier (ACTIVE)
  Model 2 – ecg_bilstm    : ECG AuscultICor v26 SL — single-lead, multi-head (ACTIVE)
  Model 3 – severity_cnn  : PyTorch multi-head murmur characterization (ACTIVE)

Falls back to deterministic demo mode if all enabled models fail to load
and ENABLE_DEMO_MODE=true.
"""

import os
import json
import pickle
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
    get_preprocessing_version,
)
from .model_registry import (
    MODEL_REGISTRY,
    get_model_config,
    list_active_models,
    list_pending_models,
)

logger = logging.getLogger(__name__)

# ─── AAMI beat-type mapping (kept for backwards-compat demo mode) ─────────────
# Model 2 uses its own embedded beat_map; this is only used for the legacy demo.
_LEGACY_BEAT_TO_AAMI = {
    "N": "Normal", "L": "Normal", "R": "Normal",
    "A": "SVEB", "V": "VEB", "F": "Fusion", "/": "Unknown",
}


class InferenceEngine:
    """
    Orchestrates all model slots defined in model_registry.MODEL_REGISTRY.

    Design principles
    -----------------
    * Each model loads in its own try/except — a broken artifact never
      prevents other models from loading.
    * Disabled/pending models are silently skipped; their absence is
      never a fatal error.
    * Enabled models with a missing artifact ARE logged as errors, and the
      system falls back to demo mode if all enabled models fail.
    * Demo mode remains fully functional for offline development.

    Model 3 is loaded from its PyTorch state_dict independently of Models 1/2.
    """

    def __init__(self, enable_demo_mode: bool = True):
        self.enable_demo_mode = enable_demo_mode
        self.demo_mode_active = False

        # Per-model runtime status (populated by _load_models)
        self.model_status: Dict[str, Dict[str, Any]] = {
            key: {"loaded": False, "error": None, "enabled": cfg.enabled, "pending": not cfg.enabled}
            for key, cfg in MODEL_REGISTRY.items()
        }

        # ── Model 1: PCG XGBoost ──────────────────────────────────────────────
        self.pcg_model = None
        self.pcg_scaler = None
        self.pcg_label_encoder = None   # sklearn LabelEncoder (optional)
        self.pcg_classes: list = []     # resolved class list

        # ── Model 2: ECG AuscultICor_Final ───────────────────────────────────
        self.ecg_model = None
        self.ecg_meta: Dict[str, Any] = {}   # metadata dict from label_encoder.pkl
        self.ecg_classes: list = []          # resolved class list

        # ── Model 3: CNN Murmur Characterization ────────────────────────────
        self.severity_model = None
        self.severity_device = None

        # ── Signal preprocessors ─────────────────────────────────────────────
        pcg_sr = int(os.getenv("PCG_SAMPLE_RATE", 22050))
        pcg_dur = float(os.getenv("PCG_TARGET_DURATION", 10))

        # ECG parameters for AuscultICor v26 SL:
        #   sample_rate = 125 Hz  (MIT-BIH training rate)
        #   window_size = 500     (samples per beat window)
        # NOTE: Changing these requires retraining the model.
        ecg_sr = int(os.getenv("ECG_SAMPLE_RATE", 125))
        ecg_ws = int(os.getenv("ECG_WINDOW_SIZE", 500))
        self.ecg_max_windows = int(os.getenv("ECG_MAX_WINDOWS", 12))

        self.pcg_preprocessor = PCGPreprocessor(
            sample_rate=pcg_sr,
            target_duration=pcg_dur,
        )
        self.ecg_preprocessor = ECGPreprocessor(
            sample_rate=ecg_sr,
            window_size=ecg_ws,
        )

        self.severity_preprocessor = PCGSeverityPreprocessor(sample_rate=pcg_sr)

        # Load all enabled models
        self._load_models()
        self._finalize_mode()

    # ─── Status ───────────────────────────────────────────────────────────────

    def get_model_status(self) -> Dict[str, Any]:
        """Return per-model availability for the /health endpoint."""
        loaded = sum(1 for s in self.model_status.values() if s["loaded"])
        active = sum(1 for s in self.model_status.values() if s["enabled"])
        return {
            "models_loaded": loaded,
            "models_active": active,
            "models_total": len(self.model_status),
            "demo_mode": self.demo_mode_active,
            "details": {
                name: {
                    "loaded": info["loaded"],
                    "enabled": info["enabled"],
                    "pending": info["pending"],
                    "error": info["error"],
                }
                for name, info in self.model_status.items()
            },
        }

    # ─── Model Loading ────────────────────────────────────────────────────────

    def _load_models(self):
        """
        Load all enabled model slots from the registry.
        Each slot is independent — failure in one never blocks the others.
        Disabled/pending slots are skipped with an info log.
        """
        self._load_pcg_model()
        self._load_ecg_model()
        self._load_severity_model()

        # Log pending slots explicitly
        for cfg in list_pending_models():
            logger.info(
                f"[Model Slot] '{cfg.key}' is PENDING/DISABLED — "
                f"version={cfg.version}. {cfg.notes}"
            )
            self.model_status[cfg.key]["pending"] = True

    def _load_pcg_model(self):
        """Load Model 1: XGBoost PCG heart sound classifier."""
        import joblib

        cfg = get_model_config("pcg_xgboost")
        if not cfg.enabled:
            logger.info("[Model 1] pcg_xgboost is disabled — skipping.")
            return

        try:
            if cfg.artifact_path is None or not cfg.artifact_path.exists():
                raise FileNotFoundError(
                    f"Model 1 (XGBoost) artifact not found at: {cfg.artifact_path}. "
                    "Set MODEL_1_PATH in your .env file."
                )

            self.pcg_model = joblib.load(cfg.artifact_path)
            logger.info(f"[Model 1] Loaded XGBoost model from {cfg.artifact_path}")

            # Optional: load scaler
            scaler_path = cfg.aux_paths.get("scaler")
            if scaler_path and scaler_path.exists():
                self.pcg_scaler = joblib.load(scaler_path)
                logger.info(f"[Model 1] Loaded PCG scaler from {scaler_path}")
            else:
                logger.warning(
                    f"[Model 1] No scaler found at {scaler_path}. "
                    "Predictions will proceed without feature scaling."
                )

            # Optional: load label encoder (sklearn LabelEncoder)
            encoder_path = cfg.aux_paths.get("encoder")
            if encoder_path and encoder_path.exists():
                self.pcg_label_encoder = joblib.load(encoder_path)
                self.pcg_classes = list(self.pcg_label_encoder.classes_)
                logger.info(f"[Model 1] Loaded PCG label encoder: {self.pcg_classes}")
            else:
                # Use the confirmed default 3-class list
                self.pcg_classes = cfg.label_mapping.get(
                    "default_classes", ["normal", "murmur", "artifact"]
                )
                logger.info(
                    f"[Model 1] No label encoder found — using default classes: {self.pcg_classes}"
                )

            self.model_status["pcg_xgboost"] = {
                "loaded": True, "error": None,
                "enabled": True, "pending": False,
            }
            logger.info(f"[Model 1] pcg_xgboost loaded successfully (version={cfg.version})")

        except Exception as exc:
            err = str(exc)
            logger.error(f"[Model 1] pcg_xgboost FAILED to load: {err}")
            self.model_status["pcg_xgboost"] = {
                "loaded": False, "error": err,
                "enabled": True, "pending": False,
            }

    def _load_ecg_model(self):
        """
        Load Model 2: ECG AuscultICor v26 SL (single-lead, multi-head).

        Input signature (v26):
            ecg_input : (batch, 500, 1)  — single-lead ECG @ 125 Hz
            rr_input  : (batch, 9)       — 9 HRV features (computed server-side)
            fc_input  : (batch, 500, 1)  — forecast context (zeros at inference)

        Output heads:
            class_head : (batch, 5) softmax — arrhythmia class
            risk_head  : (batch, 1) sigmoid — binary cardiac risk (PTB-trained)
            fc_out     : (batch, 500, 1)     — auxiliary, unused at inference

        Notes:
            keras.config.enable_unsafe_deserialization() is required because
            v26 contains custom Lambda layers serialized with Python bytecode.
        """
        cfg = get_model_config("ecg_bilstm")
        if not cfg.enabled:
            logger.info("[Model 2] ecg_bilstm is disabled — skipping.")
            return

        try:
            if cfg.artifact_path is None or not cfg.artifact_path.exists():
                raise FileNotFoundError(
                    f"Model 2 (ECG) artifact not found at: {cfg.artifact_path}. "
                    "Set MODEL_2_PATH in your .env file."
                )

            from tensorflow import keras
            # Required for v26 — model contains Lambda layers with Python bytecode.
            # This is safe here because we control the model file.
            keras.config.enable_unsafe_deserialization()
            self.ecg_model = keras.models.load_model(str(cfg.artifact_path))
            logger.info(f"[Model 2] Loaded ECG model from {cfg.artifact_path}")

            # Load metadata dict (label_encoder_SL.pkl)
            meta_path = cfg.aux_paths.get("meta")
            if meta_path and meta_path.exists():
                with open(meta_path, "rb") as f:
                    self.ecg_meta = pickle.load(f)
                logger.info(f"[Model 2] Loaded ECG metadata: {list(self.ecg_meta.keys())}")
            else:
                logger.warning(
                    f"[Model 2] No metadata file at {meta_path}. "
                    "Using registry label mapping as fallback."
                )

            # Resolve class list: prefer embedded metadata, fall back to registry
            mit_classes = self.ecg_meta.get("mit_classes", {})
            if mit_classes:
                # Convert {0: 'Normal', ...} → ['Normal', 'SVEB', ...]
                self.ecg_classes = [
                    mit_classes[i] for i in sorted(mit_classes.keys())
                ]
            else:
                self.ecg_classes = cfg.label_mapping.get(
                    "classes", ["Normal", "SVEB", "VEB", "Fusion", "Unknown"]
                )
            logger.info(f"[Model 2] ECG classes: {self.ecg_classes}")

            self.model_status["ecg_bilstm"] = {
                "loaded": True, "error": None,
                "enabled": True, "pending": False,
            }
            logger.info(
                f"[Model 2] AuscultICor v26 SL loaded successfully (version={cfg.version}). "
                "Single-lead mode — compatible with AD8232 3-electrode PCB. "
                "RR features computed server-side."
            )

        except Exception as exc:
            err = str(exc)
            logger.error(f"[Model 2] ecg_bilstm FAILED to load: {err}")
            self.model_status["ecg_bilstm"] = {
                "loaded": False, "error": err,
                "enabled": True, "pending": False,
            }


    def _load_severity_model(self):
        """Load Model 3 from its delivered PyTorch state_dict checkpoint."""
        cfg = get_model_config("severity_cnn")
        if not cfg.enabled:
            logger.info("[Model 3] severity_cnn is disabled — skipping.")
            return

        try:
            if cfg.artifact_path is None or not cfg.artifact_path.exists():
                raise FileNotFoundError(
                    f"Model 3 (CNN) artifact not found at: {cfg.artifact_path}. "
                    "Set MODEL_3_PATH in your .env file."
                )

            import torch
            from .severity_cnn import MurmurSeverityCNN

            classes = cfg.label_mapping["classes"]
            model = MurmurSeverityCNN(
                {key: len(labels) for key, labels in classes.items()},
                input_channels=int(cfg.label_mapping.get("input_channels", 4)),
            )
            checkpoint = torch.load(
                str(cfg.artifact_path), map_location="cpu", weights_only=True
            )
            if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
                checkpoint = checkpoint["state_dict"]
            if not isinstance(checkpoint, dict):
                raise TypeError("CNN checkpoint must contain a PyTorch state_dict")

            model.load_state_dict(checkpoint, strict=True)
            model.eval()
            self.severity_model = model
            self.severity_device = torch.device("cpu")
            self.model_status["severity_cnn"] = {
                "loaded": True, "error": None,
                "enabled": True, "pending": False,
            }
            logger.info(
                f"[Model 3] severity_cnn loaded successfully (version={cfg.version})"
            )
        except Exception as exc:
            err = str(exc)
            logger.error(f"[Model 3] severity_cnn FAILED to load: {err}")
            self.model_status["severity_cnn"] = {
                "loaded": False, "error": err,
                "enabled": True, "pending": False,
            }

    def _finalize_mode(self):
        """Decide whether to run in real or demo mode based on what loaded."""
        enabled_statuses = [
            s for k, s in self.model_status.items()
            if s.get("enabled") and not s.get("pending")
        ]
        any_loaded = any(s["loaded"] for s in enabled_statuses)

        if any_loaded:
            self.demo_mode_active = False
            loaded_names = [
                k for k, s in self.model_status.items() if s["loaded"]
            ]
            pending_names = [
                k for k, s in self.model_status.items() if s.get("pending")
            ]
            logger.info(
                f"InferenceEngine ready: loaded={loaded_names}, pending={pending_names}"
            )
        elif self.enable_demo_mode:
            logger.warning(
                "No enabled models loaded — activating DEMO MODE. "
                "Set ENABLE_DEMO_MODE=false with real model files for production."
            )
            self.demo_mode_active = True
        else:
            errors = "; ".join(
                f"{k}: {s['error']}"
                for k, s in self.model_status.items()
                if s.get("enabled") and s.get("error")
            )
            raise RuntimeError(
                f"All enabled models failed to load and demo mode is disabled: {errors}"
            )

    # ─── PCG Prediction ───────────────────────────────────────────────────────

    def predict_pcg(self, audio: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """
        Run PCG classification (Model 1 — XGBoost).

        Returns
        -------
        {
            'label': str,
            'probabilities': dict,
            'model_name': str,
            'model_version': str,
            'preprocessing_version': str,
            'latency_ms': int,
            'demo_mode': bool
        }
        """
        start_time = time.time()

        try:
            if not self.demo_mode_active and self.pcg_model is None:
                return {
                    "error": "PCG model not loaded",
                    "detail": self.model_status["pcg_xgboost"].get("error", "Unknown"),
                    "model_name": "pcg_xgboost_classifier",
                    "demo_mode": False,
                }

            # Preprocess
            features = self.pcg_preprocessor.process(audio, original_sr=sample_rate)
            feature_array = self.pcg_preprocessor.features_to_array(features)
            feature_array = feature_array.reshape(1, -1)

            if self.pcg_scaler is not None:
                feature_array = self.pcg_scaler.transform(feature_array)

            # Predict
            if self.demo_mode_active:
                result = self._demo_pcg_prediction(audio)
            else:
                probs = self.pcg_model.predict_proba(feature_array)[0]
                classes = self.pcg_classes  # ['artifact', 'murmur', 'normal']

                # ── Custom murmur threshold from Final__XGBoost.py training script ──
                # During training a threshold of 0.254 was applied to murmur
                # probability (index 1) to maximise clinical sensitivity.
                # Below that threshold we pick the better of artifact vs. normal.
                # This MUST mirror the threshold used when the model was evaluated.
                MURMUR_IDX = 1        # alphabetical order: 0=artifact, 1=murmur, 2=normal
                MURMUR_THRESHOLD = 0.254

                if probs[MURMUR_IDX] > MURMUR_THRESHOLD:
                    pred_idx = MURMUR_IDX
                else:
                    # Suppress murmur column; choose between artifact(0) and normal(2)
                    pred_idx = 0 if probs[0] >= probs[2] else 2

                label = classes[pred_idx]

                result = {
                    "label": label.capitalize(),
                    "confidence": float(probs[pred_idx]),
                    "murmur_probability": float(probs[MURMUR_IDX]),
                    "probabilities": {
                        cls.capitalize(): float(probs[i])
                        for i, cls in enumerate(classes)
                    },
                }

            cfg = get_model_config("pcg_xgboost")
            latency = int((time.time() - start_time) * 1000)
            result.update({
                "model_name": "pcg_xgboost_classifier",
                "model_version": cfg.version if not self.demo_mode_active else "demo",
                "preprocessing_version": get_preprocessing_version(),
                "latency_ms": latency,
                "demo_mode": self.demo_mode_active,
            })

            logger.info(f"PCG prediction: {result['label']} ({latency}ms)")
            return result

        except Exception as exc:
            logger.error(f"PCG prediction error: {exc}")
            raise

    # ─── ECG Prediction ───────────────────────────────────────────────────────

    def predict_ecg(self, ecg: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """
        Run ECG prediction (Model 2 — AuscultICor v26 SL, single-lead, multi-head).

        The model has 3 input tensors:
          - ecg_input : (batch, 500, 1)  — single-lead ECG @ 125 Hz
          - rr_input  : (batch, 9)       — 9 HRV statistics computed from signal
          - fc_input  : (batch, 500, 1)  — forecast context (zeros at inference)

        Returns
        -------
        {
            'prediction': str,        — arrhythmia class name
            'confidence': float,      — class probability
            'risk_score': float,      — cardiac risk score (0–1)
            'risk_label': str,        — 'low' | 'moderate' | 'high'
            'probabilities': dict,    — per-class probabilities
            'heart_rate_bpm': float,
            'windows_analyzed': int,
            'model_name': str,
            'model_version': str,
        }
        """
        start_time = time.time()

        try:
            if not self.demo_mode_active and self.ecg_model is None:
                return {
                    "error": "ECG model not loaded",
                    "detail": self.model_status["ecg_bilstm"].get("error", "Unknown"),
                    "model_name": "ecg_auscultIcor_v26_sl",
                    "demo_mode": False,
                }

            # Build preprocessed signal
            prepared = self._prepare_ecg_signal(ecg, sample_rate)
            heart_rate = self._estimate_heart_rate(
                prepared, self.ecg_preprocessor.sample_rate
            )

            if self.demo_mode_active:
                result = self._demo_ecg_prediction(ecg)
            else:
                windows = self._build_ecg_windows(prepared)
                batch_inputs = self._build_ecg_inputs(windows)

                raw_preds = self.ecg_model.predict(batch_inputs, verbose=0)

                # class_head → (batch, 5) softmax
                class_preds = np.array(raw_preds["class_head"])
                mean_class = np.mean(class_preds, axis=0)

                # risk_head → (batch, 1) sigmoid (PTB-trained, clinically validated)
                risk_preds = np.array(raw_preds["risk_head"])
                mean_risk = float(np.mean(risk_preds))

                pred_idx = int(np.argmax(mean_class))
                classes = self.ecg_classes or ["Normal", "SVEB", "VEB", "Fusion", "Unknown"]
                prediction = classes[pred_idx]
                confidence = float(mean_class[pred_idx])

                probabilities = {
                    cls: float(mean_class[i])
                    for i, cls in enumerate(classes)
                }

                # Three-tier risk label: low / moderate / high
                if mean_risk >= 0.7:
                    risk_label = "high"
                elif mean_risk >= 0.3:
                    risk_label = "moderate"
                else:
                    risk_label = "low"

                result = {
                    "prediction": prediction,
                    "confidence": confidence,
                    "risk_score": round(mean_risk, 4),
                    "risk_label": risk_label,
                    "probabilities": probabilities,
                    "heart_rate_bpm": heart_rate,
                    "windows_analyzed": int(class_preds.shape[0]),
                }

            cfg = get_model_config("ecg_bilstm")
            latency = int((time.time() - start_time) * 1000)
            result.update({
                "model_name": "ecg_auscultIcor_v26_sl",
                "model_version": cfg.version if not self.demo_mode_active else "demo",
                "preprocessing_version": get_preprocessing_version(),
                "latency_ms": latency,
                "demo_mode": self.demo_mode_active,
            })

            logger.info(
                f"ECG prediction: {result.get('prediction')} "
                f"risk={result.get('risk_score')} ({latency}ms)"
            )
            return result

        except Exception as exc:
            logger.error(f"ECG prediction error: {exc}")
            raise


    # ─── Murmur Characterization (Model 3) ───────────────────────────────────

    def predict_murmur_severity(
        self,
        audio: np.ndarray,
        sample_rate: int,
        valve_position: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Run the delivered six-head PyTorch CNN on PCG audio."""
        cfg = get_model_config("severity_cnn")

        if not cfg.enabled:
            logger.info("[Model 3] predict_murmur_severity called while disabled.")
            return {
                "status": "disabled",
                "model_name": "murmur_severity_cnn",
                "model_version": cfg.version,
                "message": "The murmur characterization model is disabled by configuration.",
                "demo_mode": self.demo_mode_active,
            }

        if self.severity_model is None:
            return {
                "error": "Severity model not loaded",
                "detail": self.model_status["severity_cnn"].get("error", "Unknown"),
                "model_name": "murmur_severity_cnn",
                "demo_mode": False,
            }

        start_time = time.time()
        try:
            if self.demo_mode_active:
                result = self._demo_severity_prediction()
            else:
                import torch

                channel_order = tuple(cfg.label_mapping.get(
                    "channel_order", ["AV", "MV", "PV", "TV"]
                ))
                model_input = self.severity_preprocessor.process_multichannel(
                    audio,
                    sample_rate,
                    valve_position=valve_position,
                    channel_order=channel_order,
                )
                tensor = torch.from_numpy(model_input).unsqueeze(0).to(
                    self.severity_device, dtype=torch.float32
                )
                with torch.inference_mode():
                    logits = self.severity_model(tensor)

                classes = cfg.label_mapping["classes"]
                output_names = cfg.label_mapping["head_to_output"]
                result = {}
                for head, head_logits in logits.items():
                    probabilities = torch.softmax(head_logits, dim=-1)[0].cpu().numpy()
                    result[output_names[head]] = self._parse_head(
                        probabilities, classes[head]
                    )
                normalized_position = (valve_position or "").strip().upper()
                result["valve_position"] = valve_position
                result["input_strategy"] = (
                    "position_channel_with_missing_channels_floored"
                    if normalized_position in channel_order
                    else "single_recording_replicated_across_channels"
                )

            latency = int((time.time() - start_time) * 1000)
            result.update({
                "model_name": "murmur_severity_cnn",
                "model_version": cfg.version if not self.demo_mode_active else "demo",
                "preprocessing_version": get_preprocessing_version(),
                "latency_ms": latency,
                "demo_mode": self.demo_mode_active,
            })
            logger.info(f"Severity prediction completed ({latency}ms)")
            return result

        except Exception as exc:
            logger.error(f"Severity prediction error: {exc}")
            raise

    # ─── ECG Signal Helpers ───────────────────────────────────────────────────

    def _prepare_ecg_signal(self, ecg: np.ndarray, original_sr: int) -> np.ndarray:
        """Apply ECG preprocessing stages (resample, bandpass, baseline, denoise)."""
        prepared = ecg.astype(np.float32)

        if original_sr and original_sr != self.ecg_preprocessor.sample_rate:
            prepared = scipy_signal.resample(
                prepared,
                int(len(prepared) * self.ecg_preprocessor.sample_rate / original_sr),
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
            padded = np.pad(ecg, (0, max(0, window_size - ecg.size)), mode="edge")
            return np.expand_dims(padded[:window_size], axis=0)

        starts = list(range(0, ecg.size - window_size + 1, stride))
        if not starts:
            starts = [0]

        if len(starts) > self.ecg_max_windows:
            selected = np.linspace(0, len(starts) - 1, self.ecg_max_windows, dtype=int)
            starts = [starts[idx] for idx in selected]

        windows = [ecg[s : s + window_size] for s in starts]
        return np.stack(windows, axis=0)  # (batch, window_size)

    def _build_ecg_inputs(self, ecg_windows: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Build the three input tensors required by AuscultICor v26 SL.

        ecg_input : (batch, 500, 1)   single-lead ECG (no duplication needed)
        rr_input  : (batch, 9)        HRV statistics estimated from the signal
        fc_input  : (batch, 500, 1)   forecast context — zeros at inference

        The v26 model is single-lead by design — no shim required.
        RR features are computed server-side from peak detection.
        """
        batch_size = ecg_windows.shape[0]
        window_size = self.ecg_preprocessor.window_size  # 500

        # Normalize each window (z-score)
        normalized = np.stack(
            [self.ecg_preprocessor._normalize(w) for w in ecg_windows],
            axis=0,
        ).astype(np.float32)  # (batch, 500)

        # ── ecg_input: single-lead → (batch, 500, 1) ────────────────────────
        # v26 is trained on single-lead ECG; add channel dim only.
        ecg_single = normalized[:, :, np.newaxis]  # (batch, 500, 1)

        # ── rr_input: 9 HRV features estimated from peak detection ───────────
        rr_features = self._estimate_rr_features(
            normalized, self.ecg_preprocessor.sample_rate
        )  # (batch, 9)

        # ── fc_input: forecast context — zeros at inference time ─────────────
        # During training, fc_input was the next-beat waveform target.
        # At inference time we feed zeros; the forecast head output is ignored.
        fc_context = np.zeros((batch_size, window_size, 1), dtype=np.float32)

        return {
            "ecg_input": ecg_single,
            "rr_input": rr_features,
            "fc_input": fc_context,
        }

    def _estimate_rr_features(
        self, windows: np.ndarray, sample_rate: int
    ) -> np.ndarray:
        """
        Compute 9 summary RR-interval features per window.

        Features (in order):
          0: mean RR (s)
          1: std RR (s)
          2: rmssd (s)
          3: estimated BPM
          4: NN50 count
          5: pNN50 (%)
          6: min RR (s)
          7: max RR (s)
          8: range RR (s)

        TODO(model2-pipeline): For best accuracy, compute these from the full
        continuous recording rather than per-window segments.
        """
        batch_size = windows.shape[0]
        features = np.zeros((batch_size, 9), dtype=np.float32)

        for i, window in enumerate(windows):
            energy = np.abs(window)
            prominence = max(np.std(energy) * 0.8, 0.02)
            min_dist = max(1, int(sample_rate * 0.25))

            try:
                from scipy.signal import find_peaks
                peaks, _ = find_peaks(energy, distance=min_dist, prominence=prominence)
            except Exception:
                peaks = np.array([])

            if peaks.size >= 2:
                rr = np.diff(peaks) / float(sample_rate)
                rr = rr[(rr >= 0.25) & (rr <= 2.0)]
            else:
                rr = np.array([0.8])  # 75 BPM default

            mean_rr = float(np.mean(rr))
            std_rr = float(np.std(rr)) if len(rr) > 1 else 0.0
            diffs = np.diff(rr) if len(rr) > 1 else np.array([0.0])
            rmssd = float(np.sqrt(np.mean(diffs ** 2)))
            bpm = 60.0 / mean_rr if mean_rr > 0 else 75.0
            nn50 = int(np.sum(np.abs(diffs) > 0.05))
            pnn50 = float(nn50 / len(diffs) * 100) if len(diffs) > 0 else 0.0
            min_rr = float(np.min(rr))
            max_rr = float(np.max(rr))
            range_rr = max_rr - min_rr

            features[i] = [mean_rr, std_rr, rmssd, bpm, nn50, pnn50, min_rr, max_rr, range_rr]

        return features

    def _estimate_heart_rate(
        self, ecg: np.ndarray, sample_rate: int
    ) -> Optional[float]:
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
        pred_idx = int(np.argmax(probs))
        return {
            "predicted": labels[pred_idx],
            "probabilities": {
                labels[i]: float(probs[i]) for i in range(len(labels))
            },
        }

    # ─── Demo Mode Predictions ────────────────────────────────────────────────

    def _demo_pcg_prediction(self, audio: np.ndarray, scenario: str = "normal") -> Dict[str, Any]:
        """Deterministic demo PCG prediction (3-class: normal, murmur, artifact)."""
        scenario_labels = {
            "normal": "Normal", "tachycardia": "Normal", "bradycardia": "Normal",
            "systolic_murmur": "Murmur", "diastolic_murmur": "Murmur", "combined_murmur": "Murmur",
            "abnormal_ecg": "Normal", "afib": "Normal",
        }
        expected = scenario_labels.get(scenario, "Normal")

        if expected == "Murmur":
            return {
                "label": "Murmur",
                "probabilities": {"Normal": 0.20, "Murmur": 0.75, "Artifact": 0.05},
            }
        return {
            "label": "Normal",
            "probabilities": {"Normal": 0.80, "Murmur": 0.12, "Artifact": 0.08},
        }

    def _demo_severity_prediction(self) -> Dict[str, Any]:
        """Deterministic demo severity prediction (used when Model 3 is active in demo mode)."""
        return {
            "murmur_locations": {
                "predicted": "MV",
                "probabilities": {
                    "AV": 0.10, "MV": 0.45, "PV": 0.12, "TV": 0.08,
                    "Left heart": 0.08, "Right heart": 0.05,
                    "AV+Right": 0.04, "MV+Right": 0.03,
                    "Multiple (3+)": 0.03, "Other": 0.02,
                },
            },
            "systolic_grading": {
                "predicted": "III/VI",
                "probabilities": {
                    "I/VI": 0.05, "II/VI": 0.12, "III/VI": 0.38,
                    "IV/VI": 0.22, "V/VI": 0.10, "VI/VI": 0.05, "Unknown": 0.08,
                },
            },
        }

    def _demo_ecg_prediction(self, ecg: np.ndarray) -> Dict[str, Any]:
        """Deterministic demo ECG prediction (5-class SVEB/VEB/etc.)."""
        variance = float(np.var(ecg))
        heart_rate = self._estimate_heart_rate(
            ecg.astype(np.float32), self.ecg_preprocessor.sample_rate
        )

        if variance > 2.0:
            return {
                "prediction": "VEB",
                "confidence": 0.68,
                "risk_score": 0.75,
                "risk_label": "high",
                "heart_rate_bpm": heart_rate or 96.0,
                "windows_analyzed": 1,
                "probabilities": {
                    "Normal": 0.12, "SVEB": 0.10,
                    "VEB": 0.68, "Fusion": 0.06, "Unknown": 0.04,
                },
                "pipeline_note": "Demo mode active.",
            }
        elif variance > 1.0:
            return {
                "prediction": "SVEB",
                "confidence": 0.62,
                "risk_score": 0.45,
                "risk_label": "low",
                "heart_rate_bpm": heart_rate or 88.0,
                "windows_analyzed": 1,
                "probabilities": {
                    "Normal": 0.20, "SVEB": 0.62,
                    "VEB": 0.08, "Fusion": 0.05, "Unknown": 0.05,
                },
                "pipeline_note": "Demo mode active.",
            }
        return {
            "prediction": "Normal",
            "confidence": 0.81,
            "risk_score": 0.10,
            "risk_label": "low",
            "heart_rate_bpm": heart_rate or 72.0,
            "windows_analyzed": 1,
            "probabilities": {
                "Normal": 0.81, "SVEB": 0.08,
                "VEB": 0.05, "Fusion": 0.03, "Unknown": 0.03,
            },
            "pipeline_note": "Demo mode active.",
        }
