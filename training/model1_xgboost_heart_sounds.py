"""
=============================================================================
MODEL 1: XGBoost Heart Sound Classifier
=============================================================================
Task:    Classify heart sounds into: Normal | Murmur | Artifact | Extrahls
Datasets:
  - archive2 (PASCAL Heart Sound Challenge): set_a/ + set_a.csv + set_b/ + set_b.csv
  - classification-of-heart-sound-recordings.../training-a thru training-f + validation
  Uses ALL available labelled data.

Target accuracy: >89% (paper baseline)

Usage:
  Local:  python model1_xgboost_heart_sounds.py
  Colab:  python model1_xgboost_heart_sounds.py --colab
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
from sklearn.model_selection import train_test_split, StratifiedKFold, RandomizedSearchCV
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
        pascal_base = base
        physionet_base = base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0'
    else:
        script_dir = Path(__file__).parent.resolve()
        base = script_dir.parent / 'datasets'
        pascal_base = base / 'archive2'
        physionet_base = base / 'classification-of-heart-sound-recordings-the-physionet-computing-in-cardiology-challenge-2016-1.0.0'

    output = Path(drive_root) / 'models' / 'model1_xgboost' if colab else Path(__file__).parent.parent / 'models' / 'model1_xgboost'

    return {
        'pascal_audio':  pascal_base / 'set_a',
        'pascal_csv':    pascal_base / 'set_a.csv',
        'pascal_b':      pascal_base / 'set_b',
        'pascal_b_csv':  pascal_base / 'set_b.csv',
        'physionet_a':   physionet_base / 'training-a',
        'physionet_b':   physionet_base / 'training-b',
        'physionet_c':   physionet_base / 'training-c',
        'physionet_d':   physionet_base / 'training-d',
        'physionet_e':   physionet_base / 'training-e',
        'physionet_f':   physionet_base / 'training-f',
        'physionet_val': physionet_base / 'validation',
        'output':        output,
    }

SAMPLE_RATE   = 22050
DURATION_SEC  = 10
N_MFCC        = 40
N_FFT         = 2048
HOP_LENGTH    = 512
TARGET_LABELS = ['normal', 'murmur', 'artifact', 'extrahls']

# set_b uses slightly different label names — map them
LABEL_MAP_B = {
    'normal': 'normal',
    'murmur': 'murmur',
    'extrastole': 'extrahls',     # set_b calls it "extrastole"
}

# ─── Feature Extraction ───────────────────────────────────────────────────────

def bandpass_filter(y, sr, lowcut=20, highcut=400):
    """Butterworth bandpass filter to isolate heart sounds."""
    from scipy.signal import butter, lfilter
    nyq = sr / 2
    b, a = butter(4, [lowcut / nyq, highcut / nyq], btype='band')
    return lfilter(b, a, y)


def extract_features(file_path: str, sr=SAMPLE_RATE, duration=DURATION_SEC) -> np.ndarray | None:
    """Extract a rich feature vector from a WAV heart sound recording."""
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

        # 1. MFCCs (40 × mean + std = 80)
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

        # 8. Chroma Features (12 × mean + std = 24)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)
        features.extend(np.mean(chroma, axis=1))
        features.extend(np.std(chroma, axis=1))

        # 9. Mel Spectrogram statistics (128 bands × mean + std)
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
        print(f"  [WARN] Failed to process {file_path}: {e}")
        return None


# ─── Audio-Level Augmentation ─────────────────────────────────────────────────

def augment_audio(y, sr):
    """Apply random audio-level augmentation."""
    aug_type = np.random.choice(['noise', 'stretch', 'pitch', 'shift'])
    if aug_type == 'noise':
        noise = np.random.normal(0, 0.005, len(y))
        return y + noise
    elif aug_type == 'stretch':
        rate = np.random.uniform(0.9, 1.1)
        y_stretched = librosa.effects.time_stretch(y, rate=rate)
        if len(y_stretched) < len(y):
            y_stretched = np.pad(y_stretched, (0, len(y) - len(y_stretched)))
        else:
            y_stretched = y_stretched[:len(y)]
        return y_stretched
    elif aug_type == 'pitch':
        n_steps = np.random.uniform(-1, 1)
        return librosa.effects.pitch_shift(y, sr=sr, n_steps=n_steps)
    else:
        shift = np.random.randint(sr // 4, sr)
        return np.roll(y, shift)


def extract_features_augmented(file_path: str, sr=SAMPLE_RATE, duration=DURATION_SEC) -> np.ndarray | None:
    """Extract features from an augmented version of the audio."""
    try:
        y, _ = librosa.load(file_path, sr=sr, mono=True)
        y = librosa.util.normalize(y)
        y = bandpass_filter(y, sr)
        y = augment_audio(y, sr)

        target_len = sr * duration
        if len(y) < target_len:
            y = np.pad(y, (0, target_len - len(y)))
        else:
            y = y[:target_len]

        features = []

        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH)
        features.extend(np.mean(mfcc, axis=1))
        features.extend(np.std(mfcc, axis=1))
        delta_mfcc = librosa.feature.delta(mfcc)
        features.extend(np.mean(delta_mfcc, axis=1))
        features.extend(np.std(delta_mfcc, axis=1))
        delta2_mfcc = librosa.feature.delta(mfcc, order=2)
        features.extend(np.mean(delta2_mfcc, axis=1))
        features.extend(np.std(delta2_mfcc, axis=1))

        sc = librosa.feature.spectral_centroid(y=y, sr=sr)
        features.extend([np.mean(sc), np.std(sc)])
        sr_ = librosa.feature.spectral_rolloff(y=y, sr=sr)
        features.extend([np.mean(sr_), np.std(sr_)])
        sb = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        features.extend([np.mean(sb), np.std(sb)])
        zcr = librosa.feature.zero_crossing_rate(y)
        features.extend([np.mean(zcr), np.std(zcr)])
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)
        features.extend(np.mean(chroma, axis=1))
        features.extend(np.std(chroma, axis=1))
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=128)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        features.extend(np.mean(mel_db, axis=1))
        features.extend(np.std(mel_db, axis=1))
        rms = librosa.feature.rms(y=y)
        features.extend([np.mean(rms), np.std(rms)])
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)
        features.extend(np.mean(contrast, axis=1))
        features.extend(np.std(contrast, axis=1))
        flatness = librosa.feature.spectral_flatness(y=y)
        features.extend([np.mean(flatness), np.std(flatness)])
        tonnetz = librosa.feature.tonnetz(y=librosa.effects.harmonic(y), sr=sr)
        features.extend(np.mean(tonnetz, axis=1))
        features.extend(np.std(tonnetz, axis=1))

        return np.array(features, dtype=np.float32)

    except Exception:
        return None

# ─── Dataset Loading ──────────────────────────────────────────────────────────

def load_pascal_set_a(paths: dict, augment=True) -> tuple[list, list]:
    """Load PASCAL set_a with labels from set_a.csv."""
    csv = pd.read_csv(paths['pascal_csv'])
    X, y = [], []

    labelled = csv[csv['label'].notna() & (csv['label'] != '')]

    for _, row in labelled.iterrows():
        label = row['label'].strip().lower()
        if label not in TARGET_LABELS:
            continue

        fname = Path(row['fname'])
        wav_path = paths['pascal_audio'].parent / fname
        if not wav_path.exists():
            continue

        feat = extract_features(str(wav_path))
        if feat is not None:
            X.append(feat)
            y.append(label)

            if augment:
                n_aug = 3 if label in ['murmur', 'extrahls', 'artifact'] else 1
                for _ in range(n_aug):
                    feat_aug = extract_features_augmented(str(wav_path))
                    if feat_aug is not None:
                        X.append(feat_aug)
                        y.append(label)

    print(f"  [PASCAL set_a] Loaded {len(y)} samples | Classes: {pd.Series(y).value_counts().to_dict()}")
    return X, y


def load_pascal_set_b(paths: dict, augment=True) -> tuple[list, list]:
    """
    Load PASCAL set_b by scanning filenames directly.
    Filenames encode the label: Btraining_normal_..., Btraining_murmur_..., Btraining_extrastole_...
    This avoids CSV-to-filename mismatch issues (e.g. double underscores on Drive).
    """
    set_b_dir = paths['pascal_b']
    if not set_b_dir.exists():
        print("  [WARN] set_b directory not found, skipping")
        return [], []

    X, y = [], []

    for wav_path in sorted(set_b_dir.glob('*.wav')):
        fname = wav_path.name.lower()

        # Only use labelled training files (skip Bunlabelledtest_*)
        if not fname.startswith('btraining_'):
            continue

        # Extract label from filename pattern: Btraining_{label}_{rest}.wav
        # e.g. Btraining_normal_103_... → normal
        #      Btraining_extrastole_127_... → extrastole
        #      Btraining_murmur_112_... → murmur
        #      Btraining_murmur_Btraining_noisymurmur_135_... → murmur
        parts = fname.replace('btraining_', '', 1)
        if parts.startswith('normal'):
            raw_label = 'normal'
        elif parts.startswith('murmur'):
            raw_label = 'murmur'
        elif parts.startswith('extrastole') or parts.startswith('extrahls'):
            raw_label = 'extrastole'
        else:
            continue

        label = LABEL_MAP_B.get(raw_label, raw_label)
        if label not in TARGET_LABELS:
            continue

        feat = extract_features(str(wav_path))
        if feat is not None:
            X.append(feat)
            y.append(label)

            if augment:
                n_aug = 3 if label in ['murmur', 'extrahls', 'artifact'] else 1
                for _ in range(n_aug):
                    feat_aug = extract_features_augmented(str(wav_path))
                    if feat_aug is not None:
                        X.append(feat_aug)
                        y.append(label)

    print(f"  [PASCAL set_b] Loaded {len(y)} samples | Classes: {pd.Series(y).value_counts().to_dict()}")
    return X, y


def load_physionet_dataset(paths: dict) -> tuple[list, list]:
    """Load PhysioNet 2016 training sets (a-f) with reference labels."""
    X, y = [], []
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


def load_physionet_validation(paths: dict) -> tuple[list, list]:
    """Load the PhysioNet 2016 VALIDATION set (separate from training-a..f)."""
    val_dir = paths.get('physionet_val')
    if val_dir is None or not val_dir.exists():
        print("  [WARN] PhysioNet validation directory not found, skipping")
        return [], []

    ref_path = val_dir / 'REFERENCE.csv'
    if not ref_path.exists():
        print("  [WARN] PhysioNet validation REFERENCE.csv not found")
        return [], []

    ref = pd.read_csv(ref_path, header=None)
    X, y = [], []
    count = 0

    for _, row in ref.iterrows():
        record_name = str(row.iloc[0]).strip()
        label_code  = int(row.iloc[1]) if len(row) > 1 else 0
        label = 'normal' if label_code == 1 else 'murmur'

        wav_path = val_dir / f"{record_name}.wav"
        if not wav_path.exists():
            continue

        feat = extract_features(str(wav_path))
        if feat is not None:
            X.append(feat)
            y.append(label)
            count += 1

    print(f"  [PhysioNet-VALIDATION] Loaded {count} samples")
    return X, y

# ─── Training ─────────────────────────────────────────────────────────────────

def train_xgboost(X_train, y_train_enc, X_val, y_val_enc, le):
    """Train XGBoost with SMOTE + hyperparameter search."""
    print("\n[INFO] Training XGBoost model...")

    from imblearn.over_sampling import SMOTE
    print(f"[INFO] Class distribution before SMOTE: {dict(zip(*np.unique(y_train_enc, return_counts=True)))}")
    smote = SMOTE(random_state=42, k_neighbors=3)
    X_train_res, y_train_res = smote.fit_resample(X_train, y_train_enc)
    print(f"[INFO] Class distribution AFTER SMOTE:  {dict(zip(*np.unique(y_train_res, return_counts=True)))}")

    n_classes = len(np.unique(y_train_res))

    params = {
        'n_estimators':      [300, 500, 700, 1000],
        'max_depth':         [4, 6, 8, 10],
        'learning_rate':     [0.01, 0.05, 0.1, 0.15],
        'subsample':         [0.7, 0.8, 0.9],
        'colsample_bytree':  [0.6, 0.7, 0.8, 0.9],
        'min_child_weight':  [1, 3, 5],
        'gamma':             [0, 0.1, 0.2],
        'reg_alpha':         [0, 0.01, 0.1],
        'reg_lambda':        [1, 1.5, 2],
    }

    base_model = xgb.XGBClassifier(
        objective='multi:softmax',
        num_class=n_classes,
        eval_metric='mlogloss',
        use_label_encoder=False,
        tree_method='hist',
        device='cuda' if _has_gpu() else 'cpu',
        random_state=42,
        n_jobs=-1,
    )

    search = RandomizedSearchCV(
        base_model,
        params,
        n_iter=50,
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
        scoring='f1_weighted',
        verbose=1,
        n_jobs=-1,
        random_state=42,
    )
    search.fit(X_train_res, y_train_res)

    best_model = search.best_estimator_
    print(f"\n[INFO] Best params: {search.best_params_}")

    y_pred = best_model.predict(X_val)
    acc    = accuracy_score(y_val_enc, y_pred)
    f1     = f1_score(y_val_enc, y_pred, average='weighted')
    print(f"\n[RESULT] Validation Accuracy: {acc:.4f} | Weighted F1: {f1:.4f}")
    print(classification_report(y_val_enc, y_pred, target_names=le.classes_))

    return best_model, acc, f1


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

    # ── Load ALL datasets ─────────────────────────────────────
    print("\n[STEP 1] Loading ALL datasets...")

    # 1) PASCAL set_a (labelled: ~125 samples)
    X_all, y_all = load_pascal_set_a(paths, augment=True)

    # 2) PASCAL set_b (labelled: ~312 samples → maps extrastole → extrahls)
    X_b, y_b = load_pascal_set_b(paths, augment=True)
    X_all.extend(X_b)
    y_all.extend(y_b)

    # 3) PhysioNet training-a through training-f
    if not args.no_physionet:
        X_pn, y_pn = load_physionet_dataset(paths)
        X_all.extend(X_pn)
        y_all.extend(y_pn)

    # 4) PhysioNet validation set (301 additional labelled samples)
    if not args.no_physionet:
        X_pv, y_pv = load_physionet_validation(paths)
        X_all.extend(X_pv)
        y_all.extend(y_pv)

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

    # ── Encode labels ONCE (single source of truth) ────────────
    le = LabelEncoder()
    y_enc = le.fit_transform(y_all)
    print(f"[INFO] Label mapping: {dict(zip(le.classes_, le.transform(le.classes_)))}")

    # ── Normalise features ─────────────────────────────────────
    print("\n[STEP 2] Normalising features...")
    scaler = StandardScaler()
    X_all  = scaler.fit_transform(X_all)

    # ── Train / Val split ──────────────────────────────────────
    X_train, X_val, y_train, y_val = train_test_split(
        X_all, y_enc,
        test_size=0.2,
        stratify=y_enc,
        random_state=42
    )
    print(f"[INFO] Train: {len(X_train)} | Val: {len(X_val)}")

    # ── Train ──────────────────────────────────────────────────
    print("\n[STEP 3] Training XGBoost...")
    best_model, val_acc, val_f1 = train_xgboost(X_train, y_train, X_val, y_val, le)

    # ── Final evaluation ───────────────────────────────────────
    print("\n[STEP 4] Final evaluation...")
    y_pred = best_model.predict(X_val)
    plot_confusion_matrix(y_val, y_pred, le.classes_, output_dir)

    # ── Save ───────────────────────────────────────────────────
    print("\n[STEP 5] Saving model...")
    save_model(best_model, le, scaler, output_dir)

    final_acc = accuracy_score(y_val, y_pred)
    final_f1  = f1_score(y_val, y_pred, average='weighted')
    print(f"\n{'='*60}")
    print(f"  FINAL ACCURACY: {final_acc*100:.2f}%")
    print(f"  FINAL F1-SCORE: {final_f1*100:.2f}%")
    print(f"  Model saved to: {output_dir}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
