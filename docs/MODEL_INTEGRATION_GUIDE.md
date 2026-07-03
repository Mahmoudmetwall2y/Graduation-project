# Model Integration Guide

## Overview

AscultiCor uses a **centralized model registry** (`inference/app/model_registry.py`) to manage all ML model slots. The registry controls model paths, versions, enabled/disabled state, and label mappings. No model path is hardcoded inside inference logic.

---

## Current Model Slots

| Slot | Key | Name | Status | Artifact |
|------|-----|------|--------|---------|
| Model 1 | `pcg_xgboost` | XGBoost PCG Heart Sound Classifier | ✅ **Active** | `new-models/Xgboost/heart_sound_xgboost_model.pkl` |
| Model 2 | `ecg_bilstm` | ECG AuscultICor v26 SL (Single-Lead) | ✅ **Active** | `new-models/ecg_mitbih_single_lead/single_lead_updated.keras` |
| Model 3 | `severity_cnn` | PyTorch CNN Murmur Characterization | ✅ **Active** | `new-models/CNN/best_model.pkl` |

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
├── ecg_mitbih_single_lead/
│   ├── single_lead_updated.keras       ← Model 2 (active, single-lead)
│   └── label_encoder_SL.pkl            ← Metadata dict for Model 2
└── CNN/
    ├── best_model.pkl                  ← Model 3 PyTorch state_dict
    └── confusion_matrix_*.png          ← Delivered per-head evaluation plots
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
MODEL_2_PATH=/new-models/ecg_mitbih_single_lead/single_lead_updated.keras
MODEL_2_META_PATH=/new-models/ecg_mitbih_single_lead/label_encoder_SL.pkl
MODEL_2_ENABLED=true
MODEL_2_VERSION=v26.1.0

# Model 3 — PyTorch CNN Murmur Characterization
MODEL_3_PATH=/new-models/CNN/best_model.pkl
MODEL_3_ENABLED=true
MODEL_3_VERSION=v1.0.0

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

## Model 3 Runtime Contract

`best_model.pkl` is a PyTorch `state_dict`, not a Python pickle or Keras model. The matching architecture is defined in `inference/app/severity_cnn.py`. It accepts four mel-spectrogram channels ordered as AV, MV, PV, and TV and returns six heads: timing, shape, grading, pitch, quality, and location.

The current device session supplies one PCG recording plus `valve_position`. Inference places the spectrogram in the matching channel and floors unavailable channels. If position metadata is absent, it replicates the recording across all four channels and records that fallback in `input_strategy`.

Rebuild once to install the PyTorch runtime, then use ordinary restarts for later model-setting changes:

```bash
docker compose up -d --build inference
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
  "models_loaded": 3,
  "models_total": 3,
  "demo_mode": false,
  "details": {
    "pcg_xgboost":  { "loaded": true,  "enabled": true,  "pending": false },
    "ecg_bilstm":   { "loaded": true,  "enabled": true,  "pending": false },
    "severity_cnn": { "loaded": true, "enabled": true, "pending": false,
                      "error": null }
  }
}
```

---

## Smoke Tests

Run the smoke test suite to verify the integration:

```bash
pip install pytest
python -m pytest inference/tests/test_model_registry.py -v
```

Tests confirm:
1. Registry exposes all 3 active models
2. Model 3 checkpoint keys and tensor shapes match the runtime architecture
3. Missing enabled model produces a clear error log
4. Inference response decodes all 6 CNN output heads correctly
