# Real Data vs Demo Mode

This document explains the difference between real hardware inference and demo mode,
how to verify which mode is active, and how to diagnose silent demo mode activation.

---

## What Is Demo Mode?

Demo mode causes the inference service to return **deterministic mock predictions**
instead of running the real ML models. It exists so the software stack can be
demonstrated without physical sensors or model files.

**Every mock prediction includes `"demo_mode": true`** in its database record.
The session dashboard displays these predictions with a yellow/warning tone instead
of the normal green success tone.

---

## What Triggers Demo Mode?

Demo mode activates when **any** of the following conditions is true:

| Condition | Effect |
|---|---|
| `ENABLE_DEMO_MODE=true` is set in `.env` | Full demo mode — fake predictions for all modalities |
| `ENABLE_DEMO_MODE` env var is missing AND inference runs **outside Docker** | **After audit fix:** defaults to `false` (real mode). Before fix: would have defaulted to `true`. |
| All 3 ML model files fail to load AND `ENABLE_DEMO_MODE=true` | Demo mode activates as fallback |
| All 3 ML model files fail to load AND `ENABLE_DEMO_MODE=false` | `RuntimeError` at startup — service refuses to start |
| `LLM_PROVIDER=demo` in env | LLM report generation uses template text (not Claude/GPT), regardless of inference mode |

---

## How to Verify Real Mode Is Active

### Method 1: Health endpoint

```bash
curl http://localhost:8000/health
```

Look for `"demo_mode": false` in the response JSON. If `"demo_mode": true`, stop
and follow the diagnosis steps below.

### Method 2: Startup logs

```bash
docker compose logs inference | head -60
```

In **real mode** (correct): no "DEMO MODE ACTIVE" banner.
In **demo mode** (problem):
```
============================================================
DEMO MODE ACTIVE — all predictions are deterministic mock values.
Set ENABLE_DEMO_MODE=false and mount real models for real-device use.
============================================================
```

### Method 3: Database check

In the Supabase SQL editor, run:

```sql
SELECT
  id,
  modality,
  output_json->>'demo_mode' AS demo_mode,
  created_at
FROM predictions
ORDER BY created_at DESC
LIMIT 10;
```

In real mode: all `demo_mode` values are `"false"`.
In demo mode: all `demo_mode` values are `"true"`.

### Method 4: Dashboard visual indicator

On the Session detail page, each prediction card uses a **yellow/warning tone** when
`output_json.demo_mode = true`, and a **green/success tone** for real predictions.

---

## How to Diagnose Unexpected Demo Mode

If demo mode is active when it should not be, work through this checklist in order:

### Step 1: Check ENABLE_DEMO_MODE in your active env file

```bash
grep "ENABLE_DEMO_MODE" .env
```

Expected: `ENABLE_DEMO_MODE=false`

If missing or set to `true`, fix it and restart:
```bash
docker compose restart inference
```

### Step 2: Check the container's actual environment

```bash
docker compose exec inference env | grep ENABLE_DEMO
```

Expected: `ENABLE_DEMO_MODE=false`

If the variable is missing here but set in `.env`, the compose file may not be
picking up the env file. Ensure you are running from the project root.

### Step 3: Check model file presence

```bash
docker compose exec inference ls -lh /app/models/
```

Expected output should include:
```
model1_xgboost/   (xgboost_model.pkl, scaler.pkl, label_encoder.pkl)
model2_cnn_severity/  (best_model.keras, config.json, encoder_*.pkl)
model3_bilstm_ecg/    (bilstm_model.keras, config.json, label_encoder.pkl)
```

If any directory is empty or missing, the models are not mounted correctly.
Check the `volumes:` section of `docker-compose.yml` for the inference service.

### Step 4: Check inference startup logs for model load errors

```bash
docker compose logs inference | grep -i "error\|fail\|model\|demo"
```

A model load failure combined with `ENABLE_DEMO_MODE=true` will silently activate demo mode.
A model load failure with `ENABLE_DEMO_MODE=false` will crash the service (desired behavior
in production — fail loudly rather than serve fake predictions).

---

## What Demo Data Exists in the Codebase

The following demo/mock data is present for development and testing:

| Item | Location | Active when |
|---|---|---|
| Demo org (UUID ...0001) | `supabase/seed.sql` | Only after `seed.sql` is applied to a Supabase project |
| Demo device (UUID ...0004) | `supabase/seed.sql` | Same as above |
| Stub UUIDs in firmware | `firmware/.ino:58–59` | Replaced by NVS provisioning on first boot |
| Fake PCG predictions | `inference/app/inference.py:590–631` | Only when `demo_mode_active = True` |
| Fake severity predictions | `inference/app/inference.py:633–683` | Only when `demo_mode_active = True` |
| Fake ECG predictions | `inference/app/inference.py:685–730` | Only when `demo_mode_active = True` |
| LLM template reports | `frontend/src/app/api/llm/route.ts:82` | When `LLM_PROVIDER=demo` |

---

## Real Hardware Data Flow (for Reference)

When `ENABLE_DEMO_MODE=false` and all 3 models are loaded, the full real-data path is:

```
ESP32 AD8232 ECG  (500 Hz, 12-bit ADC)
  → binary int16 MQTT  →  mqtt_handler  →  SessionBuffer
  →  resample 500→360 Hz  →  bandpass  →  BiLSTM  →  Supabase predictions

ESP32 MAX9814 PCG  (22,222 Hz, 12-bit ADC)
  → binary int16 MQTT  →  mqtt_handler  →  SessionBuffer
  →  resample 22,222→22,050 Hz  →  bandpass  →  XGBoost  →  Supabase predictions
  →  if Murmur: CNN severity  →  6 output heads  →  Supabase murmur_severity
```

All predictions include `"demo_mode": false` in their `output_json`.
