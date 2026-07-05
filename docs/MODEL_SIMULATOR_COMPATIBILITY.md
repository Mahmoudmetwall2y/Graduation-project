# Model and Simulator Compatibility

This document records the runtime contracts verified from the artifacts in
`new-models/`. The simulator generates signals inside these transport and
preprocessing domains, but synthetic labels are test intentions—not guaranteed
model predictions or clinical ground truth.

## Model 1 — PCG XGBoost

- Artifact: `heart_sound_xgboost_model.pkl`
- Classes used by inference: `artifact`, `murmur`, `normal`
- Input: 1,224 features
- Traditional path: mono PCG, resampled to 22,050 Hz, 20–400 Hz bandpass,
  first 10 seconds, 200 librosa features
- Embedding path: resampled to 16 kHz, first 3 seconds, 1,024-dimensional
  mean-pooled YAMNet embedding
- Scaler contract: 1,224 features
- Decision rule: murmur probability over 0.254 selects the murmur class;
  otherwise artifact and normal compete

The training repository does not include the fitted label encoder. Class order
is therefore reconstructed from alphabetical `LabelEncoder` behavior and the
training script. Preserve this order unless a fitted encoder/export is supplied.

## Model 2 — Functional murmur CNN

- Artifact: PyTorch state dictionary in `best_model.pkl`
- Input: four mel-spectrogram channels corresponding to `AV`, `MV`, `PV`, `TV`
- Spectrogram: 128 mel bins × 216 frames per channel at 22,050 Hz
- Outputs: timing, shape, grade, pitch, quality, and location

One physical capture currently represents one valve position. Inference places
that spectrogram in the selected channel and fills unavailable positions with
the spectrogram floor. This is tensor-compatible, but it is not equivalent to
a complete four-position examination and may reduce characterization quality.
The simulator exposes valve position so this path can be tested honestly.

## Model 3 — Single-lead ECG

- Artifact: Keras functional model in `single_lead_updated.keras`
- Transport: one MLII-like lead at 500 Hz, matching the ESP32
- Inference preprocessing: resample to 125 Hz, bandpass/baseline/denoise,
  overlapping 500-sample windows
- Inputs: ECG `(500, 1)`, nine RR/HRV features, and zero forecast context
  `(500, 1)`
- Outputs: five-class rhythm, binary research risk score, and forecast output
- Classes: `Normal`, `SVEB`, `VEB`, `Fusion`, `Unknown`

The simulator provides corresponding synthetic morphologies, including
premature narrow beats, wide ventricular beats, fusion morphology, and signal
artifact. These exercise the inference path but do not validate sensitivity or
specificity.

## Simulator-to-device parity

- MQTT topics and start/stop control follow the ESP32 protocol.
- ECG transport is 500 Hz with 500-sample chunks.
- PCG transport is the ESP32 timer's actual 22,222 Hz rate with 512-sample
  chunks; model preprocessing resamples to 22,050 Hz.
- Session metadata includes the selected valve position and a synthetic profile.
- The simulator waits for the normal dashboard start command and therefore
  exercises session creation, streaming, storage, inference, reporting, and UI.
