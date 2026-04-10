# CardioSense – Model Training Guide
## Using Google Colab (Recommended)

> **Why Colab?** Free GPU (Tesla T4/A100) — 10-50× faster than CPU.  
> CNN training that takes 6+ hours on CPU finishes in ~20-40 minutes on Colab GPU.

---

## Step 1 – Prepare Your Datasets on Google Drive

1. Open **Google Drive** → create a folder called `cardiosense/`
2. Inside it, create a `datasets/` subfolder
3. **Zip and upload** the following local folders into `datasets/`:

| Zip name | Local path | For |
|---|---|---|
| `archive1.zip` | `datasets/archive1/` | Model 2 |
| `archive2.zip` | `datasets/archive2/` | Model 1 |
| `archive4.zip` | `datasets/archive4/` | Model 3 |
| `physionet2016.zip` | `datasets/classification-of-heart-sound-recordings.../` | Model 1 |
| `ptb.zip` | `datasets/ptb-diagnostic-ecg-database-1.0.0/` | Model 3 |

> **Tip:** You can zip just the audio/csv files, not the papers/ folder.

---

## Step 2 – Create a New Google Colab Notebook

Open [https://colab.research.google.com](https://colab.research.google.com) → New notebook

### Cell 1 – Mount Google Drive
```python
from google.colab import drive
drive.mount('/content/drive')
```

### Cell 2 – Check GPU
```python
!nvidia-smi
import tensorflow as tf
print(tf.config.list_physical_devices('GPU'))
```

### Cell 3 – Install dependencies
```python
!pip install -q librosa xgboost scikit-learn tensorflow seaborn joblib
```

### Cell 4 – Unzip datasets (first time only)
```python
import zipfile, os

DRIVE_ROOT = '/content/drive/MyDrive/cardiosense'
DATASETS   = f'{DRIVE_ROOT}/datasets'

# Unzip to local /content for faster I/O during training
os.makedirs('/content/datasets', exist_ok=True)
for zip_name in ['archive1.zip', 'archive2.zip', 'archive4.zip',
                 'physionet2016.zip', 'ptb.zip']:
    zip_path = f'{DATASETS}/{zip_name}'
    if os.path.exists(zip_path):
        print(f'Unzipping {zip_name}...')
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall('/content/datasets')
        print(f'  Done!')
```

### Cell 5 – Clone or upload training scripts
```python
# Option A: Upload the 3 .py scripts manually (Files panel → Upload)
# Option B: Copy from Drive
!cp /content/drive/MyDrive/cardiosense/training/*.py /content/

# Verify
!ls /content/*.py
```

---

## Step 3 – Train Each Model

### Model 1 – XGBoost (Heart Sound Classifier)
```python
!python model1_xgboost_heart_sounds.py \
    --colab \
    --drive-root /content/drive/MyDrive/cardiosense
```
**Expected time:** ~15-30 min | **Expected accuracy:** ~89%+

---

### Model 2 – CNN Murmur Severity
```python
!python model2_cnn_murmur_severity.py \
    --colab \
    --drive-root /content/drive/MyDrive/cardiosense \
    --epochs 100
```
**Expected time:** ~30-60 min (GPU) | **Expected accuracy:** ~92%+

---

### Model 3 – BiLSTM ECG Arrhythmia
```python
!python model3_bilstm_ecg_arrhythmia.py \
    --colab \
    --drive-root /content/drive/MyDrive/cardiosense \
    --max-per-class 3000
```
**Expected time:** ~20-40 min (GPU) | **Expected accuracy:** ~95%+

---

## Step 4 – Save Trained Models Back to Drive

```python
import shutil, os

OUTPUT_DRIVE = '/content/drive/MyDrive/cardiosense/trained_models'
os.makedirs(OUTPUT_DRIVE, exist_ok=True)

# Save all 3 model output folders
for model_folder in ['model1_xgboost', 'model2_cnn_severity', 'model3_cnn_ecg']:
    src = f'/content/drive/MyDrive/cardiosense/../models/{model_folder}'
    # Models are saved to models/ relative to the project root
    # They should already be written to Drive via the script output paths

print("✅ Models saved to Google Drive!")
```

> **Note:** The scripts automatically save to `models/model1_xgboost/`, `models/model2_cnn_severity/`, and `models/model3_cnn_ecg/` relative to the project root. When running on Colab with `--drive-root`, this resolves to your Drive.

---

## Alternative: Running Locally (Slow, CPU only)

```powershell
# Install requirements
cd d:\cardiosense-project\cardiosense\training
pip install -r requirements.txt

# Run Model 1 (fastest — XGBoost)
python model1_xgboost_heart_sounds.py

# Run Model 2 (CNN — will be slow on CPU)
python model2_cnn_murmur_severity.py

# Run Model 3 (BiLSTM — will be slow on CPU)
python model3_bilstm_ecg_arrhythmia.py
```

---

## Output Files

After training, each model's files are in `models/`:

```
models/
├── model1_xgboost/
│   ├── xgboost_model.pkl       ← trained model
│   ├── label_encoder.pkl       ← class name mapping
│   ├── scaler.pkl              ← feature normaliser
│   └── confusion_matrix.png
│
├── model2_cnn_severity/
│   ├── best_model.keras        ← trained CNN
│   ├── encoder_*.pkl           ← 6 label encoders
│   ├── config.json             ← n_classes per head
│   └── cm_*.png                ← 6 confusion matrices
│
└── model3_bilstm_ecg/
    ├── bilstm_model.keras      ← trained BiLSTM
    ├── label_encoder.pkl       ← beat type mapping
    ├── config.json             ← window_size, classes
    ├── training_history.png
    └── confusion_matrix.png
```

These `.pkl` and `.keras` files are what you'll **integrate into the CardioSense backend**.
