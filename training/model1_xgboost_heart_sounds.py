"""
=============================================================================
MODEL 1: XGBoost Heart Sound Classifier
=============================================================================
Task:    Classify heart sounds into: Normal | Murmur | Artifact | Extrahls
Datasets:
  - archive2 (PASCAL Heart Sound Challenge): set_a/ + set_a.csv
  - classification-of-heart-sound-recordings.../training-a thru training-f

Target accuracy: >89% (paper baseline)

Usage:
  Local:  python model1_xgboost_heart_sounds.py
  Colab:  Upload this file + datasets to Drive, then run with --colab flag
=============================================================================
"""

import os
import sys
import warnings
import argparse
import numpy as np
import pandas as pd
import librosa
import pickle
from pathlib import Path
from sklearn.model_selection import train_test_split, StratifiedKFold, GridSearchCV
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import (classification_report, confusion_matrix,
                             accuracy_score, f1_score)
from sklearn.utils.class_weight import compute_class_weight
import xgboost as xgb
import joblib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

warnings.filterwarnings('ignore')

# ─── Configuration ────────────────────────────────────────────────────────────

def get_paths(colab=False, drive_root='/content/drive/MyDrive/cardiosense'):
    if colab:
        base = Path(drive_root) / 'datasets'
    else:
        # Detect project root: go up from training/ directory
        script_dir = Path(__file__).parent.resolve()
        base = script_dir.parent / 'datasets'

    return {
        'pascal_audio': base / 'archive2' / 'set_a',
        'pascal_csv':   base / 'archive2' / 'set_a.csv',
        'pascal_b':     base / 'archive2' / 'set_b',
        'physionet_a':  base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0' / 'training-a',
        'physionet_b':  base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0' / 'training-b',
        'physionet_c':  base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0' / 'training-c',
        'physionet_d':  base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0' / 'training-d',
        'physionet_e':  base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0' / 'training-e',
        'physionet_f':  base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0' / 'training-f',
        'output':       Path(__file__).parent.parent / 'models' / 'model1_xgboost',
    }

SAMPLE_RATE   = 22050
DURATION_SEC  = 10          # standardise to 10 seconds
N_MFCC        = 40          # more than paper's 13 → better features
N_FFT         = 2048
HOP_LENGTH    = 512
TARGET_LABELS = ['normal', 'murmur', 'artifact', 'extrahls']

# ─── Feature Extraction ───────────────────────────────────────────────────────

def bandpass_filter(y, sr, lowcut=20, highcut=400):
    """Butterworth bandpass filter to isolate heart sounds."""
    from scipy.signal import butter, lfilter
    nyq = sr / 2
    b, a = butter(4, [lowcut / nyq, highcut / nyq], btype='band')
    return lfilter(b, a, y)

def extract_features(file_path: str, sr=SAMPLE_RATE, duration=DURATION_SEC) -> np.ndarray | None:
    """
    Extract a rich feature vector from a WAV heart sound recording.
    Returns a 1-D numpy array or None on failure.
    """
    try:
        y, _ = librosa.load(file_path, sr=sr, mono=True)

        # Normalise
        y = librosa.util.normalize(y)

        # Bandpass filter (20-400 Hz for heart sounds)
        y = bandpass_filter(y, sr)

        # Standardise length
        target_len = sr * duration
        if len(y) < target_len:
            y = np.pad(y, (0, target_len - len(y)))
        else:
            y = y[:target_len]

        features = []

        # 1. MFCCs (40 coefficients × mean + std = 80)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH)
        features.extend(np.mean(mfcc, axis=1))
        features.extend(np.std(mfcc, axis=1))

        # 2. Delta MFCCs
        delta_mfcc = librosa.feature.delta(mfcc)
        features.extend(np.mean(delta_mfcc, axis=1))
        features.extend(np.std(delta_mfcc, axis=1))

        # 3. Spectral Centroid
        sc = librosa.feature.spectral_centroid(y=y, sr=sr)
        features.extend([np.mean(sc), np.std(sc)])

        # 4. Spectral Rolloff
        sr_ = librosa.feature.spectral_rolloff(y=y, sr=sr)
        features.extend([np.mean(sr_), np.std(sr_)])

        # 5. Spectral Bandwidth
        sb = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        features.extend([np.mean(sb), np.std(sb)])

        # 6. Zero-Crossing Rate
        zcr = librosa.feature.zero_crossing_rate(y)
        features.extend([np.mean(zcr), np.std(zcr)])

        # 7. Chroma Features (12 × mean + std = 24)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)
        features.extend(np.mean(chroma, axis=1))
        features.extend(np.std(chroma, axis=1))

        # 8. Mel Spectrogram statistics (128 bands × mean + std)
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=128)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        features.extend(np.mean(mel_db, axis=1))
        features.extend(np.std(mel_db, axis=1))

        # 9. RMS Energy
        rms = librosa.feature.rms(y=y)
        features.extend([np.mean(rms), np.std(rms)])

        # 10. Spectral Contrast
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)
        features.extend(np.mean(contrast, axis=1))
        features.extend(np.std(contrast, axis=1))

        return np.array(features, dtype=np.float32)

    except Exception as e:
        print(f"  [WARN] Failed to process {file_path}: {e}")
        return None

# ─── Dataset Loading ──────────────────────────────────────────────────────────

def load_pascal_dataset(paths: dict, augment=True) -> tuple[list, list]:
    """Load PASCAL set_a with labels from CSV."""
    csv = pd.read_csv(paths['pascal_csv'])
    X, y = [], []

    # Keep only rows with a valid label
    labelled = csv[csv['label'].notna() & (csv['label'] != '')]

    for _, row in labelled.iterrows():
        label = row['label'].strip().lower()
        if label not in TARGET_LABELS:
            continue

        # Build absolute file path
        fname = Path(row['fname'])
        wav_path = paths['pascal_audio'].parent / fname
        if not wav_path.exists():
            continue

        feat = extract_features(str(wav_path))
        if feat is not None:
            X.append(feat)
            y.append(label)

            # Augment minority classes
            if augment and label in ['murmur', 'extrahls']:
                for _ in range(2):
                    feat_aug = augment_features(feat)
                    X.append(feat_aug)
                    y.append(label)

    print(f"  [PASCAL] Loaded {len(y)} samples | Classes: {pd.Series(y).value_counts().to_dict()}")
    return X, y


def load_physionet_dataset(paths: dict) -> tuple[list, list]:
    """Load PhysioNet 2016 training sets (a-f) with reference labels."""
    X, y = [], []
    # training-a has REFERENCE file, others may have different naming
    for key in ['physionet_a', 'physionet_b', 'physionet_c', 'physionet_d', 'physionet_e', 'physionet_f']:
        folder = paths[key]
        if not folder.exists():
            continue
        ref_candidates = list(folder.glob('REFERENCE*.csv')) + list(folder.glob('*.csv'))
        if not ref_candidates:
            continue

        ref = None
        for r in ref_candidates:
            try:
                df = pd.read_csv(r, header=None)
                if df.shape[1] >= 2:
                    ref = df
                    break
            except Exception:
                continue

        if ref is None:
            continue

        count = 0
        for _, row in ref.iterrows():
            record_name = str(row.iloc[0]).strip()
            label_code  = int(row.iloc[1]) if len(row) > 1 else 0

            # PhysioNet 2016: 1=normal, -1=abnormal
            label = 'normal' if label_code == 1 else 'murmur'

            wav_path = folder / f"{record_name}.wav"
            if not wav_path.exists():
                continue

            feat = extract_features(str(wav_path))
            if feat is not None:
                X.append(feat)
                y.append(label)
                count += 1

        print(f"  [PhysioNet-{key.split('_')[-1].upper()}] Loaded {count} samples")

    return X, y


def augment_features(feat: np.ndarray, noise_level=0.005) -> np.ndarray:
    """Simple Gaussian noise augmentation on feature vector."""
    noise = np.random.normal(0, noise_level, feat.shape)
    return feat + noise

# ─── Training ─────────────────────────────────────────────────────────────────

def train_xgboost(X_train, y_train, X_val, y_val):
    """Train XGBoost with hyperparameter search for best accuracy."""
    print("\n[INFO] Training XGBoost model...")

    # Class weights for imbalanced data
    classes = np.unique(y_train)
    weights = compute_class_weight('balanced', classes=classes, y=y_train)
    sample_weights = np.array([weights[np.where(classes == label)[0][0]] for label in y_train])

    # Encode labels
    le = LabelEncoder()
    y_train_enc = le.fit_transform(y_train)
    y_val_enc   = le.transform(y_val)

    # XGBoost with tuned parameters (based on paper + best practices)
    params = {
        'n_estimators':      [300, 500, 700],
        'max_depth':         [4, 6, 8],
        'learning_rate':     [0.05, 0.1, 0.15],
        'subsample':         [0.8, 0.9],
        'colsample_bytree':  [0.7, 0.8],
        'min_child_weight':  [1, 3],
        'gamma':             [0, 0.1],
    }

    base_model = xgb.XGBClassifier(
        objective='multi:softmax',
        num_class=len(classes),
        eval_metric='mlogloss',
        use_label_encoder=False,
        tree_method='hist',      # fast even on CPU
        device='cuda' if _has_gpu() else 'cpu',  # use GPU if available
        random_state=42,
        n_jobs=-1,
    )

    # Use a fast grid (Randomised would also work for large grids)
    from sklearn.model_selection import RandomizedSearchCV
    search = RandomizedSearchCV(
        base_model,
        params,
        n_iter=30,
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
        scoring='f1_weighted',
        verbose=1,
        n_jobs=-1,
        random_state=42,
    )
    search.fit(X_train, y_train_enc, sample_weight=sample_weights)

    best_model = search.best_estimator_
    print(f"\n[INFO] Best params: {search.best_params_}")

    y_pred = best_model.predict(X_val)
    acc    = accuracy_score(y_val_enc, y_pred)
    f1     = f1_score(y_val_enc, y_pred, average='weighted')
    print(f"\n[RESULT] Validation Accuracy: {acc:.4f} | Weighted F1: {f1:.4f}")
    print(classification_report(y_val_enc, y_pred, target_names=le.classes_))

    return best_model, le


def _has_gpu():
    try:
        import subprocess
        result = subprocess.run(['nvidia-smi'], capture_output=True)
        return result.returncode == 0
    except Exception:
        return False

# ─── Save & Visualise ─────────────────────────────────────────────────────────

def save_model(model, le, scaler, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model,  output_dir / 'xgboost_model.pkl')
    joblib.dump(le,     output_dir / 'label_encoder.pkl')
    joblib.dump(scaler, output_dir / 'scaler.pkl')
    print(f"\n[INFO] Model saved to {output_dir}")


def plot_confusion_matrix(y_true, y_pred, classes, output_dir: Path):
    cm = confusion_matrix(y_true, y_pred)
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=classes, yticklabels=classes, ax=ax)
    ax.set_xlabel('Predicted')
    ax.set_ylabel('True')
    ax.set_title('XGBoost – Heart Sound Confusion Matrix')
    output_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_dir / 'confusion_matrix.png', dpi=150, bbox_inches='tight')
    plt.close()
    print(f"[INFO] Confusion matrix saved.")

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Train XGBoost heart sound classifier')
    parser.add_argument('--colab', action='store_true', help='Running on Google Colab')
    parser.add_argument('--drive-root', default='/content/drive/MyDrive/cardiosense',
                        help='Google Drive root path (for Colab)')
    parser.add_argument('--no-physionet', action='store_true',
                        help='Skip PhysioNet dataset (faster debug run)')
    args = parser.parse_args()

    paths = get_paths(colab=args.colab, drive_root=args.drive_root)
    output_dir = paths['output']

    print("=" * 60)
    print("  MODEL 1: XGBoost Heart Sound Classifier")
    print("=" * 60)
    print(f"  Dataset root: {paths['pascal_audio'].parent.parent}")
    print(f"  GPU available: {_has_gpu()}")

    # ── Load datasets ──────────────────────────────────────────
    print("\n[STEP 1] Loading datasets...")
    X_all, y_all = load_pascal_dataset(paths, augment=True)

    if not args.no_physionet:
        X_pn, y_pn = load_physionet_dataset(paths)
        X_all.extend(X_pn)
        y_all.extend(y_pn)

    print(f"\n[INFO] Total samples loaded: {len(X_all)}")
    print(f"[INFO] Class distribution: {pd.Series(y_all).value_counts().to_dict()}")

    if len(X_all) == 0:
        print("[ERROR] No samples loaded. Check dataset paths!")
        sys.exit(1)

    # ── Pad to common feature length ───────────────────────────
    max_len = max(f.shape[0] for f in X_all)
    X_all = np.array([
        np.pad(f, (0, max_len - f.shape[0])) if f.shape[0] < max_len else f
        for f in X_all
    ], dtype=np.float32)

    # ── Normalise features ─────────────────────────────────────
    print("\n[STEP 2] Normalising features...")
    scaler = StandardScaler()
    X_all  = scaler.fit_transform(X_all)

    # ── Train / Val split ──────────────────────────────────────
    le = LabelEncoder()
    y_enc = le.fit_transform(y_all)
    X_train, X_val, y_train, y_val = train_test_split(
        X_all, y_all,
        test_size=0.2,
        stratify=y_all,
        random_state=42
    )
    print(f"[INFO] Train: {len(X_train)} | Val: {len(X_val)}")

    # ── Train ──────────────────────────────────────────────────
    print("\n[STEP 3] Training XGBoost...")
    best_model, label_encoder = train_xgboost(X_train, y_train, X_val, y_val)

    # ── Final evaluation ───────────────────────────────────────
    print("\n[STEP 4] Final evaluation...")
    le2 = LabelEncoder().fit(y_all)
    y_val_enc  = le2.transform(y_val)
    y_pred_enc = best_model.predict(scaler.transform(X_val))
    plot_confusion_matrix(y_val_enc, y_pred_enc, le2.classes_, output_dir)

    # ── Save ───────────────────────────────────────────────────
    print("\n[STEP 5] Saving model...")
    save_model(best_model, label_encoder, scaler, output_dir)

    final_acc = accuracy_score(y_val_enc, y_pred_enc)
    print(f"\n{'='*60}")
    print(f"  FINAL ACCURACY: {final_acc*100:.2f}%")
    print(f"  Model saved to: {output_dir}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
