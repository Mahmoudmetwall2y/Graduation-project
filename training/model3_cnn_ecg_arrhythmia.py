"""
=============================================================================
MODEL 3: CNN ECG Arrhythmia Predictor
=============================================================================
Task:    Detect and classify cardiac arrhythmias from ECG signals
         Multi-class: N (Normal), V (PVC), L (LBBB), R (RBBB), A (APB), / (Paced)

Datasets:
  - archive4/mitbih_database/ – MIT-BIH Arrhythmia Database (48 records)
    Each record: {ID}.csv + {ID}annotations.txt
  - ptb-diagnostic-ecg-database-1.0.0/ – PTB Database (290 patients)
    Used for cross-validation / additional normal class samples

Architecture: 1-D CNN (temporal convolutions on raw ECG windows)
Target: >95% accuracy (achievable with proper window balancing)

Usage:
  Local:  python model3_cnn_ecg_arrhythmia.py
  Colab:  python model3_cnn_ecg_arrhythmia.py --colab
=============================================================================
"""

import os
import re
import sys
import warnings
import argparse
import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
from sklearn.utils.class_weight import compute_class_weight
from collections import Counter
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow.keras import layers, Model, optimizers, callbacks
import joblib

warnings.filterwarnings('ignore')

# ─── Configuration ────────────────────────────────────────────────────────────

def get_paths(colab=False, drive_root='/content/drive/MyDrive/cardiosense'):
    if colab:
        base = Path(drive_root) / 'datasets'
    else:
        script_dir = Path(__file__).parent.resolve()
        base = script_dir.parent / 'datasets'

    return {
        'mitbih':   base / 'archive4' / 'mitbih_database',
        'ptb':      base / 'ptb-diagnostic-ecg-database-1.0.0' / 'ptb-diagnostic-ecg-database-1.0.0',
        'output':   Path(__file__).parent.parent / 'models' / 'model3_cnn_ecg',
    }

WINDOW_SIZE   = 500      # samples per ECG window (~1.4 seconds at 360 Hz)
STEP_SIZE     = 250      # 50% overlap
SAMPLE_RATE   = 360      # MIT-BIH sampling rate
# Beat types to include (common + clinically significant)
BEAT_TYPES = {
    'N': 'Normal',
    'V': 'PVC (Premature Ventricular Contraction)',
    'L': 'Left Bundle Branch Block',
    'R': 'Right Bundle Branch Block',
    'A': 'Atrial Premature Beat',
    '/': 'Paced Beat',
    'F': 'Fusion Beat',
}

# ─── Data Loading: MIT-BIH ────────────────────────────────────────────────────

def parse_annotation_file(ann_path: str) -> pd.DataFrame:
    """
    Parse a MIT-BIH annotation .txt file exported as CSV format.
    Returns DataFrame with columns: [sample, beat_type]
    """
    rows = []
    try:
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
                    rows.append({'sample': sample, 'beat_type': beat_type})
                except ValueError:
                    continue
    except Exception as e:
        print(f"  [WARN] Error reading {ann_path}: {e}")
    return pd.DataFrame(rows)


def load_mitbih_record(record_path: str, ann_path: str) -> tuple[np.ndarray, list, list]:
    """
    Load a single MIT-BIH ECG record.
    Returns:
        signals     - shape (n_samples, 2)  [lead MLII, lead V]
        annotations - list of (sample_idx, beat_type)
    """
    # Load ECG CSV: time, MLII, V5 (columns may vary)
    df = pd.read_csv(record_path, header=None)

    # Handle common formats
    if df.shape[1] >= 3:
        signals = df.iloc[:, 1:3].values.astype(np.float32)
    elif df.shape[1] == 2:
        signals = df.values.astype(np.float32)
    else:
        signals = df.iloc[:, :1].values.astype(np.float32)
        signals = np.hstack([signals, signals])  # duplicate

    anns = parse_annotation_file(ann_path)
    annotations = []
    for _, row in anns.iterrows():
        annotations.append((int(row['sample']), str(row['beat_type'])))

    return signals, annotations


def extract_windows_from_record(signals: np.ndarray,
                                annotations: list,
                                window_size=WINDOW_SIZE,
                                half=None) -> tuple[list, list]:
    """
    Extract fixed-size windows centred around each annotated beat.
    Returns X (windows), y (beat labels).
    """
    if half is None:
        half = window_size // 2

    n = signals.shape[0]
    X, y = [], []

    for sample_idx, beat_type in annotations:
        if beat_type not in BEAT_TYPES:
            continue

        start = sample_idx - half
        end   = sample_idx + half

        if start < 0 or end > n:
            continue

        window = signals[start:end, :]   # (window_size, 2 leads)

        # Z-score normalise each lead independently
        for col in range(window.shape[1]):
            mu, sigma = window[:, col].mean(), window[:, col].std()
            if sigma > 0:
                window[:, col] = (window[:, col] - mu) / sigma

        X.append(window)
        y.append(beat_type)

    return X, y


def load_mitbih_dataset(paths: dict) -> tuple[list, list]:
    """Load all MIT-BIH records."""
    mitbih_dir = paths['mitbih']
    if not mitbih_dir.exists():
        print(f"[WARN] MIT-BIH directory not found: {mitbih_dir}")
        return [], []

    X_all, y_all = [], []
    records = sorted(set(
        f.stem for f in mitbih_dir.glob('*.csv')
        if not f.stem.endswith('annotations')
    ))
    print(f"[INFO] Found {len(records)} MIT-BIH records")

    for record_id in records:
        csv_path = mitbih_dir / f"{record_id}.csv"
        ann_path = mitbih_dir / f"{record_id}annotations.txt"

        if not csv_path.exists() or not ann_path.exists():
            continue

        try:
            signals, annotations = load_mitbih_record(str(csv_path), str(ann_path))
            X, y = extract_windows_from_record(signals, annotations)
            X_all.extend(X)
            y_all.extend(y)
        except Exception as e:
            print(f"  [WARN] Failed to load record {record_id}: {e}")
            continue

    print(f"[INFO] MIT-BIH: Loaded {len(X_all)} beat windows")
    print(f"       Class distribution: {dict(Counter(y_all))}")
    return X_all, y_all


def load_ptb_normal_samples(paths: dict, n_samples=500) -> tuple[list, list]:
    """
    Load normal ECG windows from PTB database to augment the Normal class.
    PTB patient folders each contain .dat files with ECG signals.
    We read the CSV representations if available.
    """
    ptb_dir = paths['ptb']
    X_ptb, y_ptb = [], []

    if not ptb_dir.exists():
        print(f"[WARN] PTB directory not found: {ptb_dir}")
        return [], []

    # Read CONTROLS file to get healthy patient IDs
    controls_file = ptb_dir / 'CONTROLS'
    healthy_ids = set()
    if controls_file.exists():
        with open(controls_file) as f:
            for line in f:
                parts = line.strip().split()
                if parts:
                    healthy_ids.add(parts[0])

    count = 0
    for patient_dir in sorted(ptb_dir.iterdir()):
        if not patient_dir.is_dir():
            continue

        # Check if this patient is in controls
        if healthy_ids and patient_dir.name not in healthy_ids:
            continue

        for hea_file in patient_dir.glob('*.csv'):
            if count >= n_samples:
                break
            try:
                df = pd.read_csv(hea_file, header=None)
                if df.shape[1] < 2:
                    continue
                sig = df.iloc[:, :2].values.astype(np.float32)
                if sig.shape[0] < WINDOW_SIZE:
                    continue

                # Extract a window from the middle
                mid = sig.shape[0] // 2
                window = sig[mid - WINDOW_SIZE // 2: mid + WINDOW_SIZE // 2, :]
                # Normalise
                for col in range(window.shape[1]):
                    mu, sigma = window[:, col].mean(), window[:, col].std()
                    if sigma > 0:
                        window[:, col] = (window[:, col] - mu) / sigma

                X_ptb.append(window)
                y_ptb.append('N')
                count += 1
            except Exception:
                continue

        if count >= n_samples:
            break

    print(f"[INFO] PTB Normal samples loaded: {len(X_ptb)}")
    return X_ptb, y_ptb

# ─── Model Architecture ───────────────────────────────────────────────────────

def build_ecg_cnn(input_shape: tuple, n_classes: int) -> Model:
    """
    1-D Convolutional Neural Network for ECG beat classification.

    Architecture:
      - 5 Conv1D blocks (increasing filter size: 32→64→128→256→256)
      - Residual connections for deeper learning
      - Global Average Pooling + Dense classifier
    """
    inp = layers.Input(shape=input_shape, name='ecg_input')

    # Block 1
    x = layers.Conv1D(32, 5, padding='same', activation='relu')(inp)
    x = layers.BatchNormalization()(x)
    x = layers.Conv1D(32, 5, padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling1D(2)(x)
    x = layers.Dropout(0.2)(x)

    # Block 2
    x = layers.Conv1D(64, 5, padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv1D(64, 5, padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling1D(2)(x)
    x = layers.Dropout(0.2)(x)

    # Block 3 – with residual
    residual = layers.Conv1D(128, 1, padding='same')(x)
    x = layers.Conv1D(128, 3, padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv1D(128, 3, padding='same')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Add()([x, residual])
    x = layers.Activation('relu')(x)
    x = layers.MaxPooling1D(2)(x)
    x = layers.Dropout(0.25)(x)

    # Block 4 – with residual
    residual2 = layers.Conv1D(256, 1, padding='same')(x)
    x = layers.Conv1D(256, 3, padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv1D(256, 3, padding='same')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Add()([x, residual2])
    x = layers.Activation('relu')(x)
    x = layers.MaxPooling1D(2)(x)
    x = layers.Dropout(0.3)(x)

    # Block 5
    x = layers.Conv1D(256, 3, padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.GlobalAveragePooling1D()(x)

    # Classifier
    x = layers.Dense(256, activation='relu')(x)
    x = layers.Dropout(0.4)(x)
    x = layers.Dense(128, activation='relu')(x)
    x = layers.Dropout(0.3)(x)
    out = layers.Dense(n_classes, activation='softmax', name='output')(x)

    model = Model(inputs=inp, outputs=out, name='ECG_CNN')
    return model


def balance_dataset(X: list, y: list, max_per_class=3000) -> tuple[list, list]:
    """
    Balance the dataset by oversampling rare classes and
    undersampling dominant ones to max_per_class.
    """
    from collections import defaultdict
    from sklearn.utils import resample

    class_dict = defaultdict(list)
    for feat, label in zip(X, y):
        class_dict[label].append(feat)

    X_bal, y_bal = [], []
    for label, samples in class_dict.items():
        n = len(samples)
        if n < max_per_class:
            # Oversample with replacement
            resampled = resample(samples, n_samples=max_per_class,
                                 replace=True, random_state=42)
        else:
            # Undersample
            resampled = resample(samples, n_samples=max_per_class,
                                 replace=False, random_state=42)
        X_bal.extend(resampled)
        y_bal.extend([label] * max_per_class)

    return X_bal, y_bal

# ─── Training ─────────────────────────────────────────────────────────────────

def train_model(X_train, y_train, X_val, y_val, n_classes, class_weights, output_dir: Path):
    input_shape = X_train.shape[1:]
    model = build_ecg_cnn(input_shape, n_classes)
    model.summary()

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-3),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )

    output_dir.mkdir(parents=True, exist_ok=True)

    cb_list = [
        callbacks.ModelCheckpoint(
            str(output_dir / 'best_model.keras'),
            monitor='val_accuracy', save_best_only=True, mode='max', verbose=1
        ),
        callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=5,
            min_lr=1e-7, verbose=1
        ),
        callbacks.EarlyStopping(
            monitor='val_accuracy', patience=20,
            restore_best_weights=True, mode='max', verbose=1
        ),
        callbacks.CSVLogger(str(output_dir / 'training_log.csv')),
    ]

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=100,
        batch_size=64,
        class_weight=class_weights,
        callbacks=cb_list,
        verbose=1,
    )

    return model, history

# ─── Visualisation ────────────────────────────────────────────────────────────

def plot_training_history(history, output_dir: Path):
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    axes[0].plot(history.history['accuracy'],     label='Train Acc')
    axes[0].plot(history.history['val_accuracy'], label='Val Acc')
    axes[0].set_title('Model Accuracy')
    axes[0].legend()

    axes[1].plot(history.history['loss'],     label='Train Loss')
    axes[1].plot(history.history['val_loss'], label='Val Loss')
    axes[1].set_title('Model Loss')
    axes[1].legend()

    fig.tight_layout()
    fig.savefig(output_dir / 'training_history.png', dpi=150)
    plt.close()


def plot_confusion_matrix(y_true, y_pred, classes, output_dir: Path):
    cm = confusion_matrix(y_true, y_pred)
    fig, ax = plt.subplots(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=classes, yticklabels=classes, ax=ax)
    ax.set_xlabel('Predicted')
    ax.set_ylabel('True')
    ax.set_title('ECG Arrhythmia CNN – Confusion Matrix')
    fig.tight_layout()
    fig.savefig(output_dir / 'confusion_matrix.png', dpi=150)
    plt.close()

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Train ECG arrhythmia CNN')
    parser.add_argument('--colab',      action='store_true')
    parser.add_argument('--drive-root', default='/content/drive/MyDrive/cardiosense')
    parser.add_argument('--max-per-class', type=int, default=3000,
                        help='Max samples per class after balancing')
    args = parser.parse_args()

    # GPU setup
    gpus = tf.config.list_physical_devices('GPU')
    if gpus:
        for g in gpus:
            tf.config.experimental.set_memory_growth(g, True)
        print(f"[INFO] Using {len(gpus)} GPU(s)")
    else:
        print("[INFO] No GPU – training on CPU (consider Colab for GPU)")

    paths = get_paths(colab=args.colab, drive_root=args.drive_root)
    output_dir = paths['output']

    print("=" * 60)
    print("  MODEL 3: CNN ECG Arrhythmia Predictor")
    print("=" * 60)

    # ── Load MIT-BIH ──────────────────────────────────────────
    print("\n[STEP 1] Loading MIT-BIH Arrhythmia Database...")
    X_mit, y_mit = load_mitbih_dataset(paths)

    # ── (Optional) Load PTB normals to supplement ──────────────
    print("\n[STEP 2] Loading PTB normal samples...")
    X_ptb, y_ptb = load_ptb_normal_samples(paths, n_samples=200)

    X_all = X_mit + X_ptb
    y_all = y_mit + y_ptb

    if len(X_all) == 0:
        print("[ERROR] No samples loaded. Check dataset paths!")
        sys.exit(1)

    # ── Balance dataset ───────────────────────────────────────
    print(f"\n[STEP 3] Balancing dataset (max {args.max_per_class} per class)...")
    X_all, y_all = balance_dataset(X_all, y_all, max_per_class=args.max_per_class)
    print(f"[INFO] After balancing: {len(X_all)} samples | Classes: {dict(Counter(y_all))}")

    # Convert to numpy arrays
    X = np.array(X_all, dtype=np.float32)     # (N, 500, 2)
    # Use lead 1 only + dual-lead → keep both leads
    # Shape: (N, window_size, n_leads)

    # ── Encode labels ─────────────────────────────────────────
    le = LabelEncoder()
    y_enc = le.fit_transform(y_all)
    n_classes = len(le.classes_)
    print(f"[INFO] Classes: {list(le.classes_)}")

    # ── Train/Val split ───────────────────────────────────────
    X_train, X_val, y_train, y_val = train_test_split(
        X, y_enc, test_size=0.2, stratify=y_enc, random_state=42
    )
    print(f"[INFO] Train: {len(X_train)} | Val: {len(X_val)}")
    print(f"[INFO] Input shape: {X_train.shape[1:]}")

    # ── Class weights ─────────────────────────────────────────
    raw_classes = np.unique(y_train)
    raw_weights = compute_class_weight('balanced', classes=raw_classes, y=y_train)
    class_weights = {int(cls): float(w) for cls, w in zip(raw_classes, raw_weights)}

    # ── Train ─────────────────────────────────────────────────
    print("\n[STEP 4] Training CNN...")
    model, history = train_model(X_train, y_train, X_val, y_val,
                                 n_classes, class_weights, output_dir)

    # ── Evaluate ──────────────────────────────────────────────
    print("\n[STEP 5] Evaluating model...")
    y_pred_probs = model.predict(X_val)
    y_pred       = np.argmax(y_pred_probs, axis=1)
    acc          = accuracy_score(y_val, y_pred)

    print(classification_report(y_val, y_pred, target_names=le.classes_))
    plot_training_history(history, output_dir)
    plot_confusion_matrix(y_val, y_pred, le.classes_, output_dir)

    # ── Save ──────────────────────────────────────────────────
    print("\n[STEP 6] Saving model & assets...")
    output_dir.mkdir(parents=True, exist_ok=True)
    model.save(output_dir / 'ecg_cnn_model.keras')
    joblib.dump(le, output_dir / 'label_encoder.pkl')
    with open(output_dir / 'config.json', 'w') as f:
        json.dump({
            'n_classes':   n_classes,
            'classes':     list(le.classes_),
            'window_size': WINDOW_SIZE,
            'sample_rate': SAMPLE_RATE,
        }, f, indent=2)

    print(f"\n[INFO] All assets saved to: {output_dir}")
    print(f"\n{'='*60}")
    print(f"  FINAL TEST ACCURACY: {acc*100:.2f}%")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
