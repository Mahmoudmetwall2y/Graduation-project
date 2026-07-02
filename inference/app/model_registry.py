"""
Model Registry — Central configuration layer for all ML model slots.

This file is the SINGLE SOURCE OF TRUTH for:
  - Which models exist (active or pending)
  - Where their artifact files are located (via environment variables)
  - Their task, version, enabled/disabled state, and label mappings

Usage
-----
From inference.py (or any other module):

    from .model_registry import MODEL_REGISTRY, get_model_config

    cfg = get_model_config('pcg_xgboost')
    if cfg.enabled:
        model_path = cfg.artifact_path  # resolved from env var

The Tier 2 functional model is the delivered PyTorch state_dict at
new-models/CNN/best_model.pkl; its architecture lives in severity_cnn.py.
"""

import os
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# ─── Project root resolution ──────────────────────────────────────────────────
# The project mounts model directories as Docker volumes.
# MODELS_DIR is the legacy models directory (kept for reference / fallback docs).
# NEW_MODELS_DIR is the /new-models mount where the freshly trained artifacts live.

PROJECT_ROOT = Path(__file__).parent.parent.parent  # repo root
LEGACY_MODELS_DIR = Path(os.getenv("MODELS_DIR", str(PROJECT_ROOT / "models")))
NEW_MODELS_DIR = Path(os.getenv("NEW_MODELS_DIR", str(PROJECT_ROOT / "new-models")))


# ─── Model slot dataclass ─────────────────────────────────────────────────────

@dataclass
class ModelConfig:
    """
    Descriptor for one model slot in the registry.

    Fields
    ------
    key : str
        Internal identifier used throughout inference.py and logging.
    name : str
        Human-readable model name (used in API responses).
    task : str
        What the model does (e.g. 'pcg_classification', 'ecg_arrhythmia').
    version : str
        Semantic version or 'pending' for not-yet-delivered models.
    enabled : bool
        If False the model is skipped at load time. A missing artifact
        on a DISABLED model is NOT a fatal error — the service starts normally.
        A missing artifact on an ENABLED model IS logged as an error.
    artifact_path : Optional[Path]
        Resolved path to the primary model file (.pkl / .keras / etc.).
        None means the path env var was unset — treated as missing.
    aux_paths : Dict[str, Optional[Path]]
        Paths to auxiliary artifacts (scaler, encoder, config json, …).
        Each entry may be None if the corresponding env var is unset.
    label_mapping : Dict[str, Any]
        Optional label/class information for documentation and fallback decoding.
    notes : str
        Free-text notes visible in registry dumps and health responses.
    """
    key: str
    name: str
    task: str
    version: str
    enabled: bool
    artifact_path: Optional[Path]
    aux_paths: Dict[str, Optional[Path]] = field(default_factory=dict)
    label_mapping: Dict[str, Any] = field(default_factory=dict)
    notes: str = ""


def _env_path(var: str, default: Optional[str] = None) -> Optional[Path]:
    """
    Resolve a path from an environment variable.
    Returns None (not a crash) if the variable is unset and no default given.
    """
    raw = os.getenv(var, default)
    if not raw or not raw.strip():
        return None
    return Path(raw.strip())


def _env_bool(var: str, default: str = "false") -> bool:
    return os.getenv(var, default).lower() in ("true", "1", "yes")


def _env_str(var: str, default: str = "") -> str:
    return os.getenv(var, default).strip()


# ─── Registry definition ──────────────────────────────────────────────────────

def _build_registry() -> Dict[str, ModelConfig]:
    """
    Construct the model registry from environment variables.
    Called once at module import — safe to call again for testing.
    """

    # ── Model 1: XGBoost PCG Heart Sound Classifier ──────────────────────────
    # Artifact: new-models/Xgboost/heart_sound_xgboost_model.pkl   (1224 features)
    # Scaler:   new-models/Xgboost/final_scaler.pkl                (1224 features)
    #
    # Training pipeline: traditional librosa features (200) + YAMNet embedding (1024)
    # Datasets: CirCor, PhysioNet, BUET, Archive  |  3 classes: normal/murmur/artifact
    # Preprocessing: new-models/Xgboost/preprocessing/YAMNet_*.py
    # Training script: new-models/Xgboost/Model/Final__XGBoost.py
    # ─────────────────────────────────────────────────────────────────────────
    model1 = ModelConfig(
        key="pcg_xgboost",
        name="PCG XGBoost Heart Sound Classifier",
        task="pcg_classification",
        version=_env_str("MODEL_1_VERSION", "v2.0.0"),
        enabled=_env_bool("MODEL_1_ENABLED", "true"),
        artifact_path=_env_path(
            "MODEL_1_PATH",
            str(NEW_MODELS_DIR / "Xgboost" / "heart_sound_xgboost_model.pkl"),
        ),
        aux_paths={
            "scaler": _env_path(
                "MODEL_1_SCALER_PATH",
                str(NEW_MODELS_DIR / "Xgboost" / "final_scaler.pkl"),
            ),
            # No label_encoder.pkl — classes are known from training script (LabelEncoder on 3 classes)
            "encoder": _env_path("MODEL_1_ENCODER_PATH", None),
        },
        label_mapping={
            # 3-class integer output (LabelEncoder order depends on alphabetical sort):
            # Typical CirCor/PhysioNet encoding: 0→artifact, 1→murmur, 2→normal
            # Verify by inspecting encoder.classes_ from Final__XGBoost.py training run.
            # The inference layer maps raw int index to these labels at runtime.
            "default_classes": ["artifact", "murmur", "normal"],
        },
        notes=(
            "Active. Artifact: new-models/Xgboost/heart_sound_xgboost_model.pkl "
            "(1224-feature YAMNet pipeline). 3-class output: artifact, murmur, normal. "
            "PCGPreprocessor uses YAMNet TF-Hub embedding + 13-MFCC librosa features."
        ),
    )

    # ── Tier 3: ECG Prognosis (legacy MODEL_2_* configuration) ─────────────
    # Artifact:  new-models/ecg_mitbih_single_lead/AuscultICor_v26_SL.keras
    # Meta:      new-models/ecg_mitbih_single_lead/label_encoder_SL.pkl
    #
    # Architecture: "AuscultICor_Final" — Functional multi-input, multi-output model
    # Inputs (ALL three required):
    #   ecg_input  — shape (batch, 500, 1)  Single-lead ECG @ 125 Hz
    #   rr_input   — shape (batch, 9)       9 HRV/RR-interval statistics
    #   fc_input   — shape (batch, 500, 1)  Forecast context (zeros at inference)
    #
    # Output heads:
    #   class_head — 5-class arrhythmia softmax  (N / SVEB / VEB / Fusion / Unknown)
    #   risk_head  — binary cardiac risk sigmoid  (PTB-trained, clinically validated)
    #   fc_out     — next-beat waveform (auxiliary — unused at inference)
    #
    # RR features (9-vector, computed server-side from single lead):
    #   [mean_rr, std_rr, rmssd, bpm, nn50, pnn50, min_rr, max_rr, range_rr]
    #
    # ✅ HARDWARE COMPATIBLE: Requires only single-lead ECG — matches the
    #    AD8232 3-electrode setup on the printed PCB. No hardware changes needed.
    #    RR features are estimated server-side from the ECG signal.
    # ─────────────────────────────────────────────────────────────────────────
    prognosis_model = ModelConfig(
        key="ecg_bilstm",
        name="ECG AuscultICor v26 SL (Single-Lead, Multi-Head)",
        task="ecg_arrhythmia_classification",
        version=_env_str("MODEL_2_VERSION", "v26.0.0"),
        enabled=_env_bool("MODEL_2_ENABLED", "true"),
        artifact_path=_env_path(
            "MODEL_2_PATH",
            str(NEW_MODELS_DIR / "ecg_mitbih_single_lead" / "AuscultICor_v26_SL.keras"),
        ),
        aux_paths={
            # label_encoder_SL.pkl stores a metadata dict (mit_classes, n_rr, scale, etc.)
            "meta": _env_path(
                "MODEL_2_META_PATH",
                str(NEW_MODELS_DIR / "ecg_mitbih_single_lead" / "label_encoder_SL.pkl"),
            ),
        },
        label_mapping={
            # MIT-BIH 5-class arrhythmia scheme (from label_encoder_SL.pkl)
            "classes": ["Normal", "SVEB", "VEB", "Fusion", "Unknown"],
            "index_to_label": {
                0: "Normal",
                1: "SVEB",    # Supraventricular ectopic beat
                2: "VEB",     # Ventricular ectopic beat
                3: "Fusion",
                4: "Unknown",
            },
            # Beat annotation → class-index mapping
            "beat_map": {
                "N": 0, "L": 0, "R": 0, "e": 0, "j": 0, "/": 0,  # Normal
                "A": 1, "a": 1, "J": 1, "S": 1,                    # SVEB
                "V": 2, "E": 2,                                       # VEB
                "F": 3,                                               # Fusion
            },
            # Model input parameters (must match training)
            "fs": 125,
            "input_size": 500,
            "n_leads": 1,   # SINGLE-lead — compatible with AD8232 3-electrode PCB
            "n_rr": 9,
        },
        notes=(
            "Active. AuscultICor_v26_SL — single-lead model. "
            "Inputs: ecg (500,1), rr (9,) HRV stats, fc (500,1) zeros. "
            "risk_head trained on PhysioNet PTB — clinically validated. "
            "RR features estimated server-side; no firmware changes required."
        ),
    )

    # ── Tier 2: Functional Murmur Characterization (legacy MODEL_3_*) ────────
    # Artifact: new-models/CNN/best_model.pkl (state_dict, four input channels).
    # Class order is taken from the delivered per-head confusion matrices.
    functional_model = ModelConfig(
        key="severity_cnn",
        name="CNN Murmur Characterization Classifier",
        task="murmur_severity_classification",
        version=_env_str("MODEL_3_VERSION", "v1.0.0"),
        enabled=_env_bool("MODEL_3_ENABLED", "true"),
        artifact_path=_env_path(
            "MODEL_3_PATH",
            str(NEW_MODELS_DIR / "CNN" / "best_model.pkl"),
        ),
        aux_paths={},
        label_mapping={
            "head_to_output": {
                "timing": "systolic_timing",
                "shape": "systolic_shape",
                "grading": "systolic_grading",
                "pitch": "systolic_pitch",
                "quality": "systolic_quality",
                "location": "murmur_locations",
            },
            "classes": {
                "timing": ["Early-systolic", "Holosystolic", "Late-systolic", "Mid-systolic", "Unknown"],
                "shape": ["Crescendo", "Decrescendo", "Diamond", "Plateau", "Unknown"],
                "grading": ["I/VI", "II/VI", "III/VI", "Unknown"],
                "pitch": ["High", "Low", "Medium", "Unknown"],
                "quality": ["Blowing", "Harsh", "Musical", "Unknown"],
                "location": ["AV", "Left_heart", "MV", "MV_with_right", "Multiple_valves", "PV", "Right_heart", "TV"],
            },
            "input_channels": 4,
            "channel_order": ["AV", "MV", "PV", "TV"],
        },
        notes=(
            "Active. Delivered PyTorch state_dict with six output heads: timing, "
            "shape, grading, pitch, quality, and location. Four spectrogram "
            "channels correspond to AV/MV/PV/TV auscultation positions."
        ),
    )

    registry = {
        model1.key: model1,
        prognosis_model.key: prognosis_model,
        functional_model.key: functional_model,
    }

    # Emit a startup summary so the log clearly shows registry state
    for cfg in registry.values():
        if not cfg.enabled:
            logger.info(
                f"[Registry] Model slot '{cfg.key}' is DISABLED/PENDING. "
                f"Version: {cfg.version}. {cfg.notes}"
            )
        elif cfg.artifact_path is None:
            logger.error(
                f"[Registry] Model '{cfg.key}' is ENABLED but MODEL PATH IS NOT SET. "
                "Set the corresponding MODEL_N_PATH environment variable."
            )
        else:
            logger.info(
                f"[Registry] Model '{cfg.key}' registered — "
                f"path={cfg.artifact_path}, version={cfg.version}"
            )

    return registry


# ─── Public API ───────────────────────────────────────────────────────────────

# Singleton registry built at import time
MODEL_REGISTRY: Dict[str, ModelConfig] = _build_registry()


def get_model_config(key: str) -> ModelConfig:
    """Return the ModelConfig for the given key. Raises KeyError if unknown."""
    if key not in MODEL_REGISTRY:
        raise KeyError(
            f"Unknown model key '{key}'. Known keys: {list(MODEL_REGISTRY.keys())}"
        )
    return MODEL_REGISTRY[key]


def list_active_models() -> List[ModelConfig]:
    """Return configs for all enabled (non-pending) model slots."""
    return [cfg for cfg in MODEL_REGISTRY.values() if cfg.enabled]


def list_pending_models() -> List[ModelConfig]:
    """Return configs for all disabled/pending model slots."""
    return [cfg for cfg in MODEL_REGISTRY.values() if not cfg.enabled]


def registry_summary() -> Dict[str, Dict]:
    """
    Return a JSON-serializable summary of the registry state.
    Used by the /health endpoint to expose model configuration.
    """
    summary = {}
    for key, cfg in MODEL_REGISTRY.items():
        summary[key] = {
            "name": cfg.name,
            "task": cfg.task,
            "version": cfg.version,
            "enabled": cfg.enabled,
            "artifact_path": str(cfg.artifact_path) if cfg.artifact_path else None,
            "notes": cfg.notes,
        }
    return summary
