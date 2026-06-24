# Model Integration Guide

## Overview

AscultiCor uses a **centralized model registry** (`inference/app/model_registry.py`) to manage all ML model slots. The registry controls model paths, versions, enabled/disabled state, and label mappings. No model path is hardcoded inside inference logic.

---

## Current Model Slots

| Slot | Key | Name | Status | Artifact |
|------|-----|------|--------|---------|
| Model 1 | `pcg_xgboost` | XGBoost PCG Heart Sound Classifier | ✅ **Active** | `new-models/Xgboost/heart_sound_xgboost_model.pkl` |
| Model 2 | `ecg_bilstm` | ECG AuscultICor v26 SL (Single-Lead) | ✅ **Active** | `new-models/ecg_mitbih_single_lead/AuscultICor_v26_SL.keras` |
| Model 3 | `severity_cnn` | CNN Murmur Severity Classifier | 🔜 **Pending** | `/new-models/<pending-severity-model-file>` |

---

## Directory Structure

```
new-models/
├── Xgboost/
│   ├── heart_sound_xgboost_model.pkl   ← Model 1 (active, 1224-feature YAMNet pipeline)
│   ├── final_scaler.pkl                ← Feature scaler for Model 1
│   ├── Model/
│   │   └── Final__XGBoost.py           ← Training script
│   └── preprocessing/
│       └── YAMNet_*.py                 ← Feature extraction pipeline
└── ecg_mitbih_single_lead/
    ├── AuscultICor_v26_SL.keras        ← Model 2 (active, single-lead)
    └── label_encoder_SL.pkl            ← Metadata dict for Model 2
```

> **Do not commit large model files to Git.** `.gitignore` excludes `*.pkl`, `*.keras`, `*.h5`, `*.pt`, `*.pth` inside `new-models/`.

---

## Model Paths and Configuration

All model paths are configured via **environment variables**. See `.env` for the full reference.

### Key Variables

```env
# Base directory mounted as a Docker volume
NEW_MODELS_DIR=/new-models

# Model 1 — XGBoost PCG (YAMNet, 1224-feature pipeline)
MODEL_1_PATH=/new-models/Xgboost/heart_sound_xgboost_model.pkl
MODEL_1_SCALER_PATH=/new-models/Xgboost/final_scaler.pkl
MODEL_1_ENCODER_PATH=          # leave blank — uses default 3-class list
MODEL_1_ENABLED=true
MODEL_1_VERSION=v2.0.0

# Model 2 — ECG AuscultICor v26 SL
MODEL_2_PATH=/new-models/ecg_mitbih_single_lead/AuscultICor_v26_SL.keras
MODEL_2_META_PATH=/new-models/ecg_mitbih_single_lead/label_encoder_SL.pkl
MODEL_2_ENABLED=true
MODEL_2_VERSION=v26.0.0

# Model 3 — CNN Severity (PENDING)
MODEL_3_PATH=/new-models/<pending-severity-model-file>
MODEL_3_ENABLED=false
MODEL_3_VERSION=pending

# ECG signal parameters — must match AuscultICor v26 SL training
# The inference service resamples ESP32's 500 Hz stream to 125 Hz automatically.
ECG_SAMPLE_RATE=125
ECG_WINDOW_SIZE=500
```

---

## Label Mappings

### Model 1 — PCG XGBoost (3 classes)

Trained on CirCor, PhysioNet, BUET, Archive datasets.  
Feature pipeline: **200 traditional (13-MFCC + spectral + mel + chroma) + 1024 YAMNet embedding**.

| Index | Class | Meaning |
|-------|-------|---------|
| 0 | `artifact` | Recording artifact / noise |
| 1 | `murmur` | Murmur detected |
| 2 | `normal` | Healthy heart sound |

> Class order is alphabetical (sklearn `LabelEncoder`) — `0=artifact, 1=murmur, 2=normal`.

### Model 2 — ECG AuscultICor v26 SL (5 arrhythmia classes + risk score)

Single-lead model, compatible with the AD8232 3-electrode PCB. No hardware changes needed.

| Index | Class | Meaning |
|-------|-------|---------| 
| 0 | `Normal` | Normal sinus rhythm |
| 1 | `SVEB` | Supraventricular ectopic beat |
| 2 | `VEB` | Ventricular ectopic beat |
| 3 | `Fusion` | Fusion beat |
| 4 | `Unknown` | Paced or unclassifiable beat |

Model 2 also produces a **`risk_score`** (0–1, sigmoid) from the `risk_head`:
- `risk_score < 0.3` → `"low"`
- `0.3 ≤ risk_score < 0.7` → `"moderate"`
- `risk_score ≥ 0.7` → `"high"`

**RR-interval features (9)** are computed **server-side** from R-peak detection on the raw ECG — no firmware changes required.

---

## Hardware Compatibility

| Signal | Hardware | Status |
|--------|----------|--------|
| ECG | AD8232, 3-electrode, single-lead MLII | ✅ Fully compatible — v26 SL is natively single-lead |
| PCG | MAX9814 microphone | ✅ Fully compatible |
| ESP32 sampling rate | 500 Hz (ADC, hardware timer) | ✅ Server resamples 500→125 Hz automatically |

---

## How to Enable / Disable a Model

Edit your `.env` file and set `MODEL_N_ENABLED=true/false`, then restart:

```bash
# Disable Model 2 temporarily
MODEL_2_ENABLED=false
docker compose restart inference
```

The service starts as long as at least one enabled model loads successfully.
If all enabled models fail and `ENABLE_DEMO_MODE=true`, it falls back to demo mode.

---

## How to Add Model 3 (When the Team Delivers It)

Follow these steps **in order**:

### Step 1 — Place the file
```
new-models/<severity-model-filename>.keras   ← model weights
```

### Step 2 — Set environment variables
```env
MODEL_3_PATH=/new-models/<severity-model-filename>.keras
MODEL_3_ENABLED=true
MODEL_3_VERSION=v2.0.0
```

### Step 3 — Update model_registry.py
Open `inference/app/model_registry.py` and search for `TODO(model3)`.
Fill in:
- The `artifact_path` default value (already points to env var)
- The `label_mapping` dict with the new model's output classes
- Any `aux_paths` entries (config JSON, encoders, etc.)

### Step 4 — Wire the inference code
Open `inference/app/inference.py` and search for `TODO(model3)`:

1. **`__init__`**: Uncomment `self.severity_preprocessor = PCGSeverityPreprocessor(...)`.
2. **`_load_models()`**: Uncomment the `# self._load_severity_model()` call.
3. **`_load_severity_model()`** (implement): Follow the same pattern as `_load_pcg_model()`.
4. **`predict_murmur_severity()`**: Remove the pending-stub early return. The real inference path is preserved in the docstring.

### Step 5 — Restart
```bash
docker compose restart inference
```

Check logs to confirm Model 3 loads:
```
[Model 3] severity_cnn loaded successfully (version=v2.0.0)
```

---

## Health Endpoint

The `/health` endpoint (with internal token) shows per-model status:

```json
{
  "models_loaded": 2,
  "models_total": 3,
  "demo_mode": false,
  "details": {
    "pcg_xgboost":  { "loaded": true,  "enabled": true,  "pending": false },
    "ecg_bilstm":   { "loaded": true,  "enabled": true,  "pending": false },
    "severity_cnn": { "loaded": false, "enabled": false, "pending": true,
                      "error": "PENDING — model not yet delivered" }
  }
}
```

---

## Smoke Tests

Run the smoke test suite to verify the integration:

```bash
cd inference
pip install pytest
pytest tests/test_model_registry.py -v
```

Tests confirm:
1. Registry loads with 2 active models + 1 pending
2. Disabled Model 3 does not crash the system
3. Missing enabled model produces a clear error log
4. Inference response handles 2-model output correctly
