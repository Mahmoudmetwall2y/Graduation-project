"""
=============================================================================
MODEL 2: CNN Multi-Output Murmur Severity Classifier
=============================================================================
Task:    Classify 6 murmur severity characteristics simultaneously:
         1) Locations  2) Quality  3) Timing  4) Pitch  5) Shape  6) Grading

Dataset: archive1 / CirCor DigiScope Phonocardiogram Dataset v2
         - training_data.csv  (patient metadata + labels)
         - training_data/     (WAV recordings per patient per valve)

Architecture: Multi-output CNN (6 independent classification heads)
              Input: Log-Mel Spectrogram (128 mel × T)
Target accuracy: >92% overall (paper baseline)

Usage:
  Local:  python model2_cnn_murmur_severity.py
  Colab:  python model2_cnn_murmur_severity.py --colab
=============================================================================
"""

import os
import sys
import warnings
import argparse
import json
import numpy as np
import pandas as pd
import librosa
from pathlib import Path
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, f1_score
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

# TensorFlow / Keras
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow.keras import layers, Model, optimizers, callbacks
from tensorflow.keras.utils import to_categorical
import joblib

warnings.filterwarnings('ignore')

# ─── Configuration ────────────────────────────────────────────────────────────

def get_paths(colab=False, drive_root='/content/drive/MyDrive/cardiosense'):
    if colab:
        base = Path(drive_root) / 'datasets' / 'archive1'
    else:
        script_dir = Path(__file__).parent.resolve()
        base = script_dir.parent / 'datasets' / 'archive1'

    return {
        'csv':    base / 'training_data.csv',
        'audio':  base / 'training_data',
        'output': Path(__file__).parent.parent / 'models' / 'model2_cnn_severity',
    }

SAMPLE_RATE   = 22050
DURATION_SEC  = 5
N_MELS        = 128
N_FFT         = 2048
HOP_LENGTH    = 512
TARGET_SR     = 22050

# The 6 murmur severity label columns from the CSV
LABEL_COLS = {
    'systolic_timing':   'Systolic murmur timing',
    'systolic_shape':    'Systolic murmur shape',
    'systolic_grading':  'Systolic murmur grading',
    'systolic_pitch':    'Systolic murmur pitch',
    'systolic_quality':  'Systolic murmur quality',
    'murmur_locations':  'Murmur locations',
}

VALVE_LOCATIONS = ['AV', 'PV', 'TV', 'MV']

# ─── Feature Extraction (Log-Mel Spectrogram) ─────────────────────────────────

def extract_logmel(file_path: str, sr=TARGET_SR, duration=DURATION_SEC,
                   n_mels=N_MELS) -> np.ndarray | None:
    """
    Convert a WAV recording to a log-mel spectrogram.
    Returns shape: (n_mels, time_frames)
    """
    try:
        y, _ = librosa.load(file_path, sr=sr, mono=True)

        # Normalise amplitude
        if np.max(np.abs(y)) > 0:
            y = y / np.max(np.abs(y))

        # Standardise length
        target_len = sr * duration
        if len(y) < target_len:
            y = np.pad(y, (0, target_len - len(y)))
        else:
            y = y[:target_len]

        mel = librosa.feature.melspectrogram(
            y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=n_mels
        )
        log_mel = librosa.power_to_db(mel, ref=np.max)

        # Normalise to 0-1
        log_mel = (log_mel - log_mel.min()) / (log_mel.max() - log_mel.min() + 1e-8)
        return log_mel.astype(np.float32)

    except Exception as e:
        print(f"  [WARN] Failed: {file_path}: {e}")
        return None

# ─── Dataset Loading ──────────────────────────────────────────────────────────

def load_dataset(paths: dict, augment=True) -> tuple[np.ndarray, dict, dict]:
    """
    Load heart sound recordings for murmur-positive patients.
    Returns:
        X       - array of log-mel spectrograms
        y_dict  - dict {label_key: encoded label array}
        encoders - dict {label_key: LabelEncoder}
    """
    df = pd.read_csv(paths['csv'])
    audio_dir = paths['audio']

    # Filter rows: only patients with murmur PRESENT (we need severity labels)
    murmur_df = df[df['Murmur'] == 'Present'].copy()
    print(f"[INFO] Patients with murmur Present: {len(murmur_df)}")

    # Drop rows missing ALL severity labels
    label_cols = list(LABEL_COLS.values())
    murmur_df = murmur_df.dropna(subset=label_cols, how='all')
    print(f"[INFO] After removing all-NaN label rows: {len(murmur_df)}")

    X_list = []
    y_lists = {k: [] for k in LABEL_COLS}
    feat_size = None

    for _, row in murmur_df.iterrows():
        patient_id = str(int(row['Patient ID'])).strip()

        # Try all 4 valve locations; collect spectrograms from available recordings
        spectrograms = []
        for valve in VALVE_LOCATIONS:
            fpath = audio_dir / f"{patient_id}_{valve}.wav"
            if fpath.exists():
                spec = extract_logmel(str(fpath))
                if spec is not None:
                    spectrograms.append(spec)

        if not spectrograms:
            continue

        # Average spectrograms across available valve recordings
        merged = np.mean(spectrograms, axis=0)

        if feat_size is None:
            feat_size = merged.shape
        elif merged.shape != feat_size:
            # Resize to common shape if needed
            continue

        X_list.append(merged)

        # Labels
        for key, col in LABEL_COLS.items():
            val = row.get(col, np.nan)
            y_lists[key].append(str(val).strip() if pd.notna(val) else 'Unknown')

        # Augmentation: time-shift (simulate different heartbeat timings)
        if augment:
            shift = np.random.randint(1, merged.shape[1] // 4)
            augmented = np.roll(merged, shift, axis=1)
            X_list.append(augmented)
            for key in LABEL_COLS:
                y_lists[key].append(y_lists[key][-1])  # same label

    print(f"[INFO] Total samples (with augmentation): {len(X_list)}")

    X = np.array(X_list, dtype=np.float32)
    # Add channel dim for CNN: (N, H, W, 1)
    X = X[..., np.newaxis]

    # Encode labels
    encoders = {}
    y_encoded = {}
    for key in LABEL_COLS:
        le = LabelEncoder()
        arr = np.array(y_lists[key])
        encoded = le.fit_transform(arr)
        encoders[key] = le
        y_encoded[key] = encoded
        print(f"  [LABEL] {key}: {dict(zip(le.classes_, np.bincount(encoded)))}")

    return X, y_encoded, encoders

# ─── Model Architecture ───────────────────────────────────────────────────────

def build_multi_output_cnn(input_shape: tuple, n_classes: dict) -> Model:
    """
    Build a shared-backbone CNN with 6 independent output heads.

    Architecture:
      - 4 convolutional blocks (increasing filters: 32→64→128→256)
      - Global Average Pooling
      - 6 dense classifier heads
    """
    inp = layers.Input(shape=input_shape, name='input')

    # ── Shared Backbone ─────────
    x = layers.Conv2D(32, (3, 3), padding='same', activation='relu')(inp)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(32, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Dropout(0.25)(x)

    x = layers.Conv2D(64, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(64, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Dropout(0.25)(x)

    x = layers.Conv2D(128, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(128, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Dropout(0.35)(x)

    x = layers.Conv2D(256, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dense(512, activation='relu')(x)
    x = layers.Dropout(0.4)(x)
    shared = layers.Dense(256, activation='relu')(x)

    # ── Output Heads ────────────
    outputs = {}
    for key, n_cls in n_classes.items():
        head = layers.Dense(128, activation='relu', name=f'dense_{key}')(shared)
        head = layers.Dropout(0.3)(head)
        out = layers.Dense(n_cls, activation='softmax', name=key)(head)
        outputs[key] = out

    model = Model(inputs=inp, outputs=outputs, name='MultiOutputMurmurCNN')
    return model

# ─── Training ─────────────────────────────────────────────────────────────────

def train_model(X_train, y_train, X_val, y_val, n_classes, output_dir: Path):
    input_shape = X_train.shape[1:]
    model = build_multi_output_cnn(input_shape, n_classes)
    model.summary()

    # Loss and metrics for each output head
    losses   = {k: 'sparse_categorical_crossentropy' for k in n_classes}
    metrics  = {k: ['accuracy'] for k in n_classes}
    loss_wts = {k: 1.0 for k in n_classes}

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-3),
        loss=losses,
        metrics=metrics,
        loss_weights=loss_wts,
    )

    output_dir.mkdir(parents=True, exist_ok=True)

    cb_list = [
        callbacks.ModelCheckpoint(
            str(output_dir / 'best_model.keras'),
            monitor='val_loss', save_best_only=True, verbose=1
        ),
        callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=5,
            min_lr=1e-6, verbose=1
        ),
        callbacks.EarlyStopping(
            monitor='val_loss', patience=15,
            restore_best_weights=True, verbose=1
        ),
        callbacks.CSVLogger(str(output_dir / 'training_log.csv')),
    ]

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=100,
        batch_size=32,
        callbacks=cb_list,
        verbose=1,
    )

    return model, history

# ─── Evaluation ───────────────────────────────────────────────────────────────

def evaluate_and_save(model, X_val, y_val, encoders, output_dir: Path):
    preds = model.predict(X_val)
    overall_accs = []

    output_dir.mkdir(parents=True, exist_ok=True)
    for i, key in enumerate(LABEL_COLS):
        if isinstance(preds, dict):
            pred_arr = preds[key]
        else:
            pred_arr = preds[i]

        y_true = y_val[key]
        y_pred = np.argmax(pred_arr, axis=1)
        acc = accuracy_score(y_true, y_pred)
        overall_accs.append(acc)

        print(f"\n── {key} ──")
        print(f"   Accuracy: {acc:.4f}")
        print(classification_report(y_true, y_pred, target_names=encoders[key].classes_))

        # Confusion matrix
        cm = confusion_matrix(y_true, y_pred)
        fig, ax = plt.subplots(figsize=(8, 6))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                    xticklabels=encoders[key].classes_,
                    yticklabels=encoders[key].classes_, ax=ax)
        ax.set_title(f'Confusion Matrix – {key}')
        fig.tight_layout()
        fig.savefig(output_dir / f'cm_{key}.png', dpi=120)
        plt.close()

    overall = np.mean(overall_accs)
    print(f"\n{'='*55}")
    print(f"  OVERALL ACCURACY (mean across 6 heads): {overall*100:.2f}%")
    print(f"{'='*55}")
    return overall

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Train CNN murmur severity classifier')
    parser.add_argument('--colab',      action='store_true')
    parser.add_argument('--drive-root', default='/content/drive/MyDrive/cardiosense')
    parser.add_argument('--epochs',     type=int, default=100)
    parser.add_argument('--batch-size', type=int, default=32)
    args = parser.parse_args()

    # GPU setup
    gpus = tf.config.list_physical_devices('GPU')
    if gpus:
        for g in gpus:
            tf.config.experimental.set_memory_growth(g, True)
        print(f"[INFO] Using {len(gpus)} GPU(s)")
    else:
        print("[INFO] No GPU found – training on CPU (consider using Colab for GPU)")

    paths = get_paths(colab=args.colab, drive_root=args.drive_root)
    output_dir = paths['output']

    print("=" * 60)
    print("  MODEL 2: CNN Multi-Output Murmur Severity Classifier")
    print("=" * 60)

    # ── Load data ─────────────────────────────────────────────
    print("\n[STEP 1] Loading dataset...")
    X, y_encoded, encoders = load_dataset(paths, augment=True)

    if len(X) == 0:
        print("[ERROR] No samples loaded – check dataset paths!")
        sys.exit(1)

    # ── Train/Val split ───────────────────────────────────────
    indices = np.arange(len(X))
    # stratify on primary label (timing)
    primary_key = 'systolic_timing'
    train_idx, val_idx = train_test_split(
        indices,
        test_size=0.2,
        stratify=y_encoded.get(primary_key),
        random_state=42
    )

    X_train = X[train_idx]
    X_val   = X[val_idx]
    y_train = {k: v[train_idx] for k, v in y_encoded.items()}
    y_val   = {k: v[val_idx]   for k, v in y_encoded.items()}

    # n_classes per head
    n_classes = {k: len(le.classes_) for k, le in encoders.items()}
    print(f"\n[INFO] n_classes: {n_classes}")
    print(f"[INFO] Train: {len(X_train)} | Val: {len(X_val)}")
    print(f"[INFO] Input shape: {X_train.shape[1:]}")

    # ── Train ─────────────────────────────────────────────────
    print("\n[STEP 2] Training model...")
    model, history = train_model(X_train, y_train, X_val, y_val, n_classes, output_dir)

    # ── Evaluate ──────────────────────────────────────────────
    print("\n[STEP 3] Evaluating model...")
    overall_acc = evaluate_and_save(model, X_val, y_val, encoders, output_dir)

    # ── Save encoders ─────────────────────────────────────────
    for key, le in encoders.items():
        joblib.dump(le, output_dir / f'encoder_{key}.pkl')

    # Save n_classes config for inference
    with open(output_dir / 'config.json', 'w') as f:
        json.dump({'n_classes': n_classes, 'label_keys': list(LABEL_COLS.keys())}, f)

    print(f"\n[INFO] All assets saved to: {output_dir}")
    print(f"\n{'='*60}")
    print(f"  FINAL OVERALL ACCURACY: {overall_acc*100:.2f}%")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
