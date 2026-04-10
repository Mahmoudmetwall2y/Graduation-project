"""
=============================================================================
AscultiCor — Model Validation & Accuracy Test Suite
=============================================================================
Tests all 3 deployed models against held-out data from the original datasets.
Uses the EXACT same preprocessing pipeline as the inference engine.

Usage:
    python validate_models.py

Output:
    - Per-model accuracy, F1-score, classification report
    - Confusion matrices saved to models/validation/
    - Summary table printed to console
=============================================================================
"""

import os
import sys
import json
import time
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score
)
from sklearn.model_selection import train_test_split
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

warnings.filterwarnings('ignore')

# ─── Paths ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.resolve()
MODELS_DIR   = PROJECT_ROOT / 'models'
DATASETS_DIR = PROJECT_ROOT / 'datasets'
OUTPUT_DIR   = MODELS_DIR / 'validation'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

RESULTS = {}


def print_header(title):
    print(f"\n{'='*65}")
    print(f"  {title}")
    print(f"{'='*65}")


def plot_cm(y_true, y_pred, classes, title, save_path):
    """Plot and save a confusion matrix."""
    cm = confusion_matrix(y_true, y_pred, labels=range(len(classes)))
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=classes, yticklabels=classes, ax=ax)
    ax.set_xlabel('Predicted')
    ax.set_ylabel('True')
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(save_path, dpi=150)
    plt.close()
    print(f"  Confusion matrix saved: {save_path.name}")


# =============================================================================
# MODEL 1: XGBoost Heart Sound Classifier
# =============================================================================

def validate_model1():
    print_header("MODEL 1: XGBoost Heart Sound Classifier")

    import joblib
    import librosa
    from scipy.signal import butter, lfilter

    model_dir = MODELS_DIR / 'model1_xgboost'
    model_path = model_dir / 'xgboost_model.pkl'
    encoder_path = model_dir / 'label_encoder.pkl'
    scaler_path = model_dir / 'scaler.pkl'

    if not model_path.exists():
        print("  [SKIP] Model file not found")
        return

    model = joblib.load(model_path)
    le = joblib.load(encoder_path)
    scaler = joblib.load(scaler_path)
    print(f"  Model loaded. Classes: {list(le.classes_)}")

    # ── Feature extraction (same as training script) ──
    SR = 22050
    DURATION = 10
    N_MFCC = 40
    N_FFT = 2048
    HOP_LENGTH = 512

    def bandpass_filter(y, sr, lowcut=20, highcut=400):
        nyq = sr / 2
        b, a = butter(4, [lowcut / nyq, highcut / nyq], btype='band')
        return lfilter(b, a, y)

    def extract_features(file_path, sr=SR, duration=DURATION):
        """Exact copy of training script's extract_features()."""
        try:
            y, _ = librosa.load(file_path, sr=sr, mono=True)
            y = librosa.util.normalize(y)
            y = bandpass_filter(y, sr)
            target_len = sr * duration
            if len(y) < target_len:
                y = np.pad(y, (0, target_len - len(y)))
            else:
                y = y[:target_len]

            features = []

            # 1. MFCCs (40 x mean + std = 80)
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH)
            features.extend(np.mean(mfcc, axis=1))
            features.extend(np.std(mfcc, axis=1))

            # 2. Delta MFCCs
            delta_mfcc = librosa.feature.delta(mfcc)
            features.extend(np.mean(delta_mfcc, axis=1))
            features.extend(np.std(delta_mfcc, axis=1))

            # 3. Delta-Delta MFCCs
            delta2_mfcc = librosa.feature.delta(mfcc, order=2)
            features.extend(np.mean(delta2_mfcc, axis=1))
            features.extend(np.std(delta2_mfcc, axis=1))

            # 4. Spectral Centroid
            sc = librosa.feature.spectral_centroid(y=y, sr=sr)
            features.extend([np.mean(sc), np.std(sc)])

            # 5. Spectral Rolloff
            sr_ = librosa.feature.spectral_rolloff(y=y, sr=sr)
            features.extend([np.mean(sr_), np.std(sr_)])

            # 6. Spectral Bandwidth
            sb = librosa.feature.spectral_bandwidth(y=y, sr=sr)
            features.extend([np.mean(sb), np.std(sb)])

            # 7. Zero-Crossing Rate
            zcr = librosa.feature.zero_crossing_rate(y)
            features.extend([np.mean(zcr), np.std(zcr)])

            # 8. Chroma Features (12 x mean + std = 24)
            chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)
            features.extend(np.mean(chroma, axis=1))
            features.extend(np.std(chroma, axis=1))

            # 9. Mel Spectrogram statistics (128 bands x mean + std)
            mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=128)
            mel_db = librosa.power_to_db(mel, ref=np.max)
            features.extend(np.mean(mel_db, axis=1))
            features.extend(np.std(mel_db, axis=1))

            # 10. RMS Energy
            rms = librosa.feature.rms(y=y)
            features.extend([np.mean(rms), np.std(rms)])

            # 11. Spectral Contrast
            contrast = librosa.feature.spectral_contrast(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)
            features.extend(np.mean(contrast, axis=1))
            features.extend(np.std(contrast, axis=1))

            # 12. Spectral Flatness
            flatness = librosa.feature.spectral_flatness(y=y)
            features.extend([np.mean(flatness), np.std(flatness)])

            # 13. Tonnetz
            tonnetz = librosa.feature.tonnetz(y=librosa.effects.harmonic(y), sr=sr)
            features.extend(np.mean(tonnetz, axis=1))
            features.extend(np.std(tonnetz, axis=1))

            return np.array(features, dtype=np.float32)
        except Exception as e:
            return None

    # ── Load PASCAL set_a (labelled test data) ──
    csv_path = DATASETS_DIR / 'archive2' / 'set_a.csv'
    audio_dir = DATASETS_DIR / 'archive2' / 'set_a'

    if not csv_path.exists():
        print("  [SKIP] PASCAL set_a not found")
        return

    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    label_col = [c for c in df.columns if 'label' in c.lower()][0]
    fname_col = [c for c in df.columns if 'fname' in c.lower() or 'file' in c.lower()][0]

    X_all, y_all = [], []
    skipped = 0
    for _, row in df.iterrows():
        label = str(row[label_col]).strip().lower()
        if label not in ['normal', 'murmur', 'artifact', 'extrahls', 'extrastole']:
            skipped += 1
            continue
        if label == 'extrastole':
            label = 'extrahls'

        fname = str(row[fname_col]).strip()
        # CSV fname may include 'set_a/' prefix — use basename only
        fname_base = Path(fname).name
        fpath = audio_dir / fname_base
        if not fpath.suffix:
            fpath = fpath.with_suffix('.wav')
        if not fpath.exists():
            skipped += 1
            continue

        feat = extract_features(str(fpath))
        if feat is not None:
            X_all.append(feat)
            y_all.append(label)

    print(f"  Loaded {len(X_all)} samples ({skipped} skipped)")

    if len(X_all) == 0:
        print("  [SKIP] No valid samples")
        return

    # Convert to array — features should be exactly 558 dimensions now
    X_all = np.array(X_all, dtype=np.float32)
    print(f"  Feature dimensions: {X_all.shape[1]} (expected: {scaler.n_features_in_})")

    X_scaled = scaler.transform(X_all)

    # Encode labels
    y_enc = le.transform(y_all)

    # Predict
    y_pred = model.predict(X_scaled)

    # Results
    acc = accuracy_score(y_enc, y_pred)
    f1 = f1_score(y_enc, y_pred, average='weighted')
    print(f"\n  Accuracy:  {acc*100:.2f}%")
    print(f"  F1-Score:  {f1*100:.2f}%")
    print(f"\n{classification_report(y_enc, y_pred, target_names=le.classes_, zero_division=0)}")

    plot_cm(y_enc, y_pred, le.classes_,
            'Model 1: XGBoost Heart Sound — Validation',
            OUTPUT_DIR / 'model1_validation_cm.png')

    RESULTS['Model 1 (XGBoost PCG)'] = {'accuracy': acc, 'f1': f1, 'samples': len(X_all)}


# =============================================================================
# MODEL 2: CNN Murmur Severity
# =============================================================================

def validate_model2():
    print_header("MODEL 2: CNN Murmur Severity Classifier")

    import joblib
    import librosa

    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
    import tensorflow as tf

    model_dir = MODELS_DIR / 'model2_cnn_severity'
    model_path = model_dir / 'best_model.keras'
    config_path = model_dir / 'config.json'

    if not model_path.exists():
        print("  [SKIP] Model file not found")
        return

    model = tf.keras.models.load_model(str(model_path))
    print(f"  Model loaded: {model_path.name}")

    # Load encoders
    encoders = {}
    for pkl in model_dir.glob("encoder_*.pkl"):
        key = pkl.stem.replace("encoder_", "")
        encoders[key] = joblib.load(pkl)
    print(f"  Loaded {len(encoders)} label encoders")

    with open(config_path) as f:
        config = json.load(f)
    label_keys = config.get('label_keys', list(encoders.keys()))

    # ── Feature extraction (same as training) ──
    SR = 22050
    DURATION = 5
    N_MELS = 128
    N_FFT = 2048
    HOP_LENGTH = 512
    VALVE_LOCATIONS = ['AV', 'PV', 'TV', 'MV']

    def extract_logmel(file_path):
        try:
            y, _ = librosa.load(file_path, sr=SR, mono=True)
            if np.max(np.abs(y)) > 0:
                y = y / np.max(np.abs(y))
            target_len = SR * DURATION
            if len(y) < target_len:
                y = np.pad(y, (0, target_len - len(y)))
            else:
                y = y[:target_len]
            mel = librosa.feature.melspectrogram(y=y, sr=SR, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=N_MELS)
            log_mel = librosa.power_to_db(mel, ref=np.max)
            log_mel = (log_mel - log_mel.min()) / (log_mel.max() - log_mel.min() + 1e-8)
            return log_mel.astype(np.float32)
        except:
            return None

    # ── Load CirCor dataset ──
    csv_path = DATASETS_DIR / 'archive1' / 'training_data.csv'
    # Audio files may be in training_data/ or training_data/training_data/
    audio_dir = DATASETS_DIR / 'archive1' / 'training_data'
    nested = audio_dir / 'training_data'
    if nested.is_dir():
        audio_dir = nested

    if not csv_path.exists():
        print("  [SKIP] CirCor dataset not found")
        return

    df = pd.read_csv(csv_path)
    LABEL_COLS = {
        'systolic_timing':  'Systolic murmur timing',
        'systolic_shape':   'Systolic murmur shape',
        'systolic_grading': 'Systolic murmur grading',
        'systolic_pitch':   'Systolic murmur pitch',
        'systolic_quality': 'Systolic murmur quality',
        'murmur_locations': 'Murmur locations',
    }

    X_list, y_lists = [], {k: [] for k in LABEL_COLS}
    y_lists['murmur_present'] = []
    feat_size = None
    skipped = 0

    # Only use a subset for validation speed (max 200 patients)
    df_sample = df.sample(n=min(200, len(df)), random_state=42)

    for _, row in df_sample.iterrows():
        patient_id = str(int(row['Patient ID'])).strip()
        murmur_status = str(row.get('Murmur', 'Unknown')).strip()

        spectrograms = []
        for valve in VALVE_LOCATIONS:
            fpath = audio_dir / f"{patient_id}_{valve}.wav"
            if fpath.exists():
                spec = extract_logmel(str(fpath))
                if spec is not None:
                    spectrograms.append(spec)

        if not spectrograms:
            skipped += 1
            continue

        merged = np.mean(spectrograms, axis=0)

        if feat_size is None:
            feat_size = merged.shape
        elif merged.shape != feat_size:
            skipped += 1
            continue

        X_list.append(merged)
        y_lists['murmur_present'].append(murmur_status)
        for key, col in LABEL_COLS.items():
            if murmur_status == 'Present':
                val = row.get(col, np.nan)
                y_lists[key].append(str(val).strip() if pd.notna(val) else 'None')
            else:
                y_lists[key].append('None')

    print(f"  Loaded {len(X_list)} patient samples ({skipped} skipped)")

    if len(X_list) == 0:
        print("  [SKIP] No valid samples")
        return

    X = np.array(X_list, dtype=np.float32)
    X = X[..., np.newaxis]  # channel dim

    # Predict
    predictions = model.predict(X, verbose=0)

    # Evaluate each head
    all_label_keys = list(LABEL_COLS.keys()) + ['murmur_present']
    overall_accs = []

    for i, key in enumerate(all_label_keys):
        encoder = encoders.get(key)
        if encoder is None:
            continue

        # Encode ground truth
        y_true_raw = y_lists[key]
        # Only evaluate on classes the encoder knows
        valid_mask = [v in encoder.classes_ for v in y_true_raw]
        y_true_filtered = [v for v, m in zip(y_true_raw, valid_mask) if m]

        if isinstance(predictions, dict):
            pred_arr = predictions[key]
        elif isinstance(predictions, list):
            pred_arr = predictions[i]
        else:
            pred_arr = predictions

        pred_filtered = pred_arr[valid_mask]

        if len(y_true_filtered) == 0:
            continue

        y_true_enc = encoder.transform(y_true_filtered)
        y_pred_idx = np.argmax(pred_filtered, axis=1)

        acc = accuracy_score(y_true_enc, y_pred_idx)
        overall_accs.append(acc)
        print(f"  {key:25s}  accuracy: {acc*100:.1f}%")

    if overall_accs:
        mean_acc = np.mean(overall_accs)
        print(f"\n  Overall Mean Accuracy: {mean_acc*100:.2f}%")
        RESULTS['Model 2 (CNN Severity)'] = {
            'accuracy': mean_acc,
            'f1': mean_acc,  # approximate
            'samples': len(X_list),
            'heads': len(overall_accs)
        }


# =============================================================================
# MODEL 3: BiLSTM ECG Arrhythmia
# =============================================================================

def validate_model3():
    print_header("MODEL 3: BiLSTM ECG Arrhythmia Predictor")

    import joblib
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
    import tensorflow as tf

    model_dir = MODELS_DIR / 'model3_bilstm_ecg'
    model_path = model_dir / 'bilstm_model.keras'
    encoder_path = model_dir / 'label_encoder.pkl'
    config_path = model_dir / 'config.json'

    if not model_path.exists():
        print("  [SKIP] Model file not found")
        return

    model = tf.keras.models.load_model(str(model_path))
    le = joblib.load(encoder_path)
    with open(config_path) as f:
        config = json.load(f)

    print(f"  Model loaded. Classes: {list(le.classes_)}")

    WINDOW_SIZE = config.get('window_size', 300)
    BEAT_TYPES = {'N', 'V', 'L', 'R', 'A', '/', 'F'}

    # ── Load MIT-BIH records ──
    mitbih_dir = DATASETS_DIR / 'archive4' / 'mitbih_database'

    if not mitbih_dir.exists():
        print("  [SKIP] MIT-BIH dataset not found")
        return

    # Parse annotation file
    def parse_annotations(ann_path):
        rows = []
        with open(ann_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or line.startswith('Sample'):
                    continue
                parts = line.split()
                if len(parts) < 3:
                    continue
                try:
                    sample = int(parts[1])
                    beat_type = parts[2]
                    rows.append((sample, beat_type))
                except ValueError:
                    continue
        return rows

    # Use a subset of records for validation
    record_files = sorted(mitbih_dir.glob("*.csv"))
    record_ids = sorted(set(f.stem for f in record_files if not f.stem.endswith('annotations')))

    # Use 10 records as held-out test
    np.random.seed(42)
    test_records = np.random.choice(record_ids, size=min(10, len(record_ids)), replace=False)

    X_all, y_all = [], []
    half = WINDOW_SIZE // 2

    for rec_id in test_records:
        csv_path = mitbih_dir / f"{rec_id}.csv"
        ann_path = mitbih_dir / f"{rec_id}annotations.txt"

        if not csv_path.exists() or not ann_path.exists():
            continue

        # Load signals
        df = pd.read_csv(csv_path, header=None, skiprows=2)
        if df.shape[1] >= 3:
            signals = df.iloc[:, 1:3].values.astype(np.float32)
        elif df.shape[1] == 2:
            signals = df.values.astype(np.float32)
        else:
            signals = df.iloc[:, :1].values.astype(np.float32)
            signals = np.hstack([signals, signals])

        annotations = parse_annotations(str(ann_path))
        n = signals.shape[0]

        for sample_idx, beat_type in annotations:
            if beat_type not in BEAT_TYPES:
                continue
            start = sample_idx - half
            end = sample_idx + half
            if start < 0 or end > n:
                continue

            window = signals[start:end, :]
            # Z-score normalise each lead
            for col in range(window.shape[1]):
                mu, sigma = window[:, col].mean(), window[:, col].std()
                if sigma > 0:
                    window[:, col] = (window[:, col] - mu) / sigma

            X_all.append(window)
            y_all.append(beat_type)

    print(f"  Loaded {len(X_all)} ECG windows from {len(test_records)} records")

    if len(X_all) == 0:
        print("  [SKIP] No valid samples")
        return

    X = np.array(X_all, dtype=np.float32)
    y_enc = le.transform(y_all)

    # Predict
    y_pred_prob = model.predict(X, verbose=0)
    y_pred = np.argmax(y_pred_prob, axis=1)

    # Results
    acc = accuracy_score(y_enc, y_pred)
    f1 = f1_score(y_enc, y_pred, average='weighted')
    print(f"\n  Accuracy:  {acc*100:.2f}%")
    print(f"  F1-Score:  {f1*100:.2f}%")
    print(f"\n{classification_report(y_enc, y_pred, target_names=le.classes_, zero_division=0)}")

    plot_cm(y_enc, y_pred, le.classes_,
            'Model 3: BiLSTM ECG — Validation',
            OUTPUT_DIR / 'model3_validation_cm.png')

    RESULTS['Model 3 (BiLSTM ECG)'] = {'accuracy': acc, 'f1': f1, 'samples': len(X_all)}


# =============================================================================
# MAIN
# =============================================================================

def main():
    print("\n" + "█" * 65)
    print("  AscultiCor — Model Validation & Accuracy Test Suite")
    print("█" * 65)
    print(f"  Models dir:   {MODELS_DIR}")
    print(f"  Datasets dir: {DATASETS_DIR}")
    print(f"  Output dir:   {OUTPUT_DIR}")

    start = time.time()

    validate_model1()
    validate_model2()
    validate_model3()

    elapsed = time.time() - start

    # ── Summary ──
    print_header("SUMMARY")
    print(f"  {'Model':<28} {'Accuracy':>10} {'F1-Score':>10} {'Samples':>10}")
    print(f"  {'─'*28} {'─'*10} {'─'*10} {'─'*10}")
    for name, r in RESULTS.items():
        print(f"  {name:<28} {r['accuracy']*100:>9.2f}% {r['f1']*100:>9.2f}% {r['samples']:>10}")

    print(f"\n  Total validation time: {elapsed:.1f}s")
    print(f"  Results saved to: {OUTPUT_DIR}")
    print(f"{'='*65}\n")


if __name__ == '__main__':
    main()
