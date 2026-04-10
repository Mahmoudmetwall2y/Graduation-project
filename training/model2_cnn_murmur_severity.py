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
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix, f1_score
from sklearn.utils.class_weight import compute_class_weight
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
        # On Drive, archive1 contents extracted flat into datasets/
        base = Path(drive_root) / 'datasets'
        output = Path(drive_root) / 'models' / 'model2_cnn_severity'
        audio_dir = base / 'training_data' / 'training_data'
    else:
        script_dir = Path(__file__).parent.resolve()
        base = script_dir.parent / 'datasets' / 'archive1'
        output = Path(__file__).parent.parent / 'models' / 'model2_cnn_severity'
        audio_dir = base / 'training_data'

    return {
        'csv':    base / 'training_data.csv',
        'audio':  audio_dir,
        'output': output,
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

# ─── Spectrogram Augmentation ─────────────────────────────────────────────────

def augment_spectrogram(spec):
    """Apply compound SpecAugment-style augmentation (2-3 transforms per call)."""
    augmented = spec.copy()
    h, w = augmented.shape

    # Apply 2-3 transforms randomly for more diversity
    n_transforms = np.random.choice([2, 3])
    transforms = np.random.choice(
        ['time_mask', 'freq_mask', 'noise', 'time_shift', 'gain', 'freq_warp'],
        size=n_transforms, replace=False
    )

    for aug_type in transforms:
        if aug_type == 'time_mask':
            t = np.random.randint(1, max(2, w // 6))
            t0 = np.random.randint(0, max(1, w - t))
            augmented[:, t0:t0+t] = 0.0

        elif aug_type == 'freq_mask':
            f = np.random.randint(1, max(2, h // 6))
            f0 = np.random.randint(0, max(1, h - f))
            augmented[f0:f0+f, :] = 0.0

        elif aug_type == 'noise':
            noise_level = np.random.uniform(0.005, 0.03)
            noise = np.random.normal(0, noise_level, augmented.shape)
            augmented = augmented + noise

        elif aug_type == 'time_shift':
            shift = np.random.randint(1, max(2, w // 5))
            augmented = np.roll(augmented, shift, axis=1)

        elif aug_type == 'gain':
            # Random gain scaling
            gain = np.random.uniform(0.8, 1.2)
            augmented = augmented * gain

        elif aug_type == 'freq_warp':
            # Subtle frequency warping via row shuffling of neighboring bins
            n_swap = np.random.randint(1, max(2, h // 10))
            for _ in range(n_swap):
                idx = np.random.randint(0, h - 1)
                augmented[[idx, idx+1]] = augmented[[idx+1, idx]]

    augmented = np.clip(augmented, 0, 1)
    return augmented.astype(np.float32)

# ─── Dataset Loading ──────────────────────────────────────────────────────────

def load_dataset(paths: dict, augment=True) -> tuple[np.ndarray, dict, dict]:
    """
    Load heart sound recordings for ALL patients (Absent + Present + Unknown).
    
    Uses averaged spectrograms across valve recordings per patient for a cleaner
    signal representation. Includes class-balanced augmentation.
    
    Returns:
        X       - array of log-mel spectrograms
        y_dict  - dict {label_key: encoded label array}
        encoders - dict {label_key: LabelEncoder}
    """
    df = pd.read_csv(paths['csv'])
    audio_dir = paths['audio']

    print(f"[INFO] Total patients in CSV: {len(df)}")
    print(f"[INFO] Murmur distribution: {df['Murmur'].value_counts().to_dict()}")

    X_list = []
    y_lists = {k: [] for k in LABEL_COLS}
    y_lists['murmur_present'] = []
    feat_size = None

    def _append_labels(murmur_status, row):
        """Append labels for one sample."""
        y_lists['murmur_present'].append(murmur_status)
        for key, col in LABEL_COLS.items():
            if murmur_status == 'Present':
                val = row.get(col, np.nan)
                y_lists[key].append(str(val).strip() if pd.notna(val) else 'None')
            else:
                y_lists[key].append('None')

    for _, row in df.iterrows():
        patient_id = str(int(row['Patient ID'])).strip()
        murmur_status = str(row.get('Murmur', 'Unknown')).strip()

        # Collect spectrograms from all available valve recordings
        spectrograms = []
        for valve in VALVE_LOCATIONS:
            fpath = audio_dir / f"{patient_id}_{valve}.wav"
            if fpath.exists():
                spec = extract_logmel(str(fpath))
                if spec is not None:
                    spectrograms.append(spec)

        if not spectrograms:
            continue

        # Average spectrograms across valve recordings for a cleaner signal
        merged = np.mean(spectrograms, axis=0)

        if feat_size is None:
            feat_size = merged.shape
        elif merged.shape != feat_size:
            continue

        X_list.append(merged)
        _append_labels(murmur_status, row)

        # Class-balanced augmentation
        if augment:
            if murmur_status == 'Present':
                n_aug = 6  # heavy augmentation for minority class
            elif murmur_status == 'Unknown':
                n_aug = 4
            else:
                n_aug = 2  # lighter for majority Absent class

            for _ in range(n_aug):
                aug_spec = augment_spectrogram(merged)
                X_list.append(aug_spec)
                _append_labels(murmur_status, row)

    print(f"[INFO] Total samples (with augmentation): {len(X_list)}")

    X = np.array(X_list, dtype=np.float32)
    X = X[..., np.newaxis]  # Channel dim for CNN: (N, H, W, 1)

    # Encode labels (includes murmur_present)
    all_label_keys = list(LABEL_COLS.keys()) + ['murmur_present']
    encoders = {}
    y_encoded = {}
    for key in all_label_keys:
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
    Deeper shared-backbone CNN with 4 conv blocks + residual-style skip.
    Optimised for the ~3000 sample dataset with all patients.
    """
    inp = layers.Input(shape=input_shape, name='input')

    # ── Block 1 ─────────
    x = layers.Conv2D(32, (3, 3), padding='same', activation='relu')(inp)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(32, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Dropout(0.2)(x)

    # ── Block 2 ─────────
    x = layers.Conv2D(64, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(64, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Dropout(0.25)(x)

    # ── Block 3 ─────────
    x = layers.Conv2D(128, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(128, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Dropout(0.3)(x)

    # ── Block 4 (new) ─────────
    x = layers.Conv2D(256, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.GlobalAveragePooling2D()(x)

    # ── Shared Dense ─────────
    x = layers.Dense(512, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.0005))(x)
    x = layers.Dropout(0.4)(x)
    shared = layers.Dense(256, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.0005))(x)
    shared = layers.Dropout(0.3)(shared)

    # ── Output Heads ────────────
    outputs = {}
    for key, n_cls in n_classes.items():
        head = layers.Dense(128, activation='relu', name=f'dense_{key}',
                           kernel_regularizer=tf.keras.regularizers.l2(0.0005))(shared)
        head = layers.Dropout(0.3)(head)
        out = layers.Dense(n_cls, activation='softmax', name=key)(head)
        outputs[key] = out

    model = Model(inputs=inp, outputs=outputs, name='MultiOutputMurmurCNN')
    return model

# ─── Training ─────────────────────────────────────────────────────────────────

def compute_sample_weights(y_train, n_classes):
    """
    Compute per-sample weights as the MAXIMUM class weight across all 6 heads.
    This is the correct way to handle class imbalance for multi-output Keras models,
    since model.fit(class_weight=...) doesn't support dict-of-dicts properly.
    """
    n_samples = len(list(y_train.values())[0])
    sample_weights = np.ones(n_samples, dtype=np.float32)

    for key in n_classes:
        y_int = y_train[key]
        classes = np.unique(y_int)
        cw = compute_class_weight('balanced', classes=classes, y=y_int)
        weight_map = dict(zip(classes, cw))
        head_weights = np.array([weight_map.get(yi, 1.0) for yi in y_int])
        # Take the element-wise maximum across heads
        sample_weights = np.maximum(sample_weights, head_weights)

    print(f"[INFO] Sample weight range: {sample_weights.min():.3f} - {sample_weights.max():.3f}")
    return sample_weights


def train_model(X_train, y_train, X_val, y_val, n_classes, output_dir: Path):
    input_shape = X_train.shape[1:]
    model = build_multi_output_cnn(input_shape, n_classes)
    model.summary()

    losses   = {k: tf.keras.losses.SparseCategoricalCrossentropy(
                    from_logits=False) for k in n_classes}
    metrics  = {k: ['accuracy'] for k in n_classes}
    # Higher weight for the primary murmur detection head
    loss_wts = {k: (2.0 if k == 'murmur_present' else 1.0) for k in n_classes}

    # Compute sample weights (correct approach for multi-output)
    sample_weights = compute_sample_weights(y_train, n_classes)

    # Cosine decay with warmup for better convergence
    total_epochs = 200
    steps_per_epoch = max(1, len(X_train) // 16)
    total_steps = total_epochs * steps_per_epoch
    warmup_steps = 5 * steps_per_epoch

    lr_schedule = tf.keras.optimizers.schedules.CosineDecay(
        initial_learning_rate=5e-4,
        decay_steps=total_steps - warmup_steps,
        alpha=1e-6,
        warmup_target=5e-4,
        warmup_steps=warmup_steps,
    )

    model.compile(
        optimizer=optimizers.Adam(learning_rate=lr_schedule),
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
        callbacks.EarlyStopping(
            monitor='val_loss', patience=30,
            restore_best_weights=True, verbose=1
        ),
        callbacks.CSVLogger(str(output_dir / 'training_log.csv')),
    ]

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=total_epochs,
        batch_size=16,
        sample_weight=sample_weights,
        callbacks=cb_list,
        verbose=1,
    )

    return model, history

# ─── Evaluation ───────────────────────────────────────────────────────────────

def evaluate_and_save(model, X_val, y_val, encoders, output_dir: Path):
    preds = model.predict(X_val)
    overall_accs = []

    all_label_keys = list(LABEL_COLS.keys()) + ['murmur_present']
    output_dir.mkdir(parents=True, exist_ok=True)
    for i, key in enumerate(all_label_keys):
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
        
        classes = encoders[key].classes_
        labels = np.arange(len(classes))
        
        print(classification_report(y_true, y_pred, labels=labels, target_names=classes, zero_division=0))

        # Confusion matrix
        cm = confusion_matrix(y_true, y_pred, labels=labels)
        fig, ax = plt.subplots(figsize=(8, 6))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                    xticklabels=classes,
                    yticklabels=classes, ax=ax)
        ax.set_title(f'Confusion Matrix – {key}')
        fig.tight_layout()
        fig.savefig(output_dir / f'cm_{key}.png', dpi=120)
        plt.close()

    overall = np.mean(overall_accs)
    print(f"\n{'='*55}")
    print(f"  OVERALL ACCURACY (mean across {len(all_label_keys)} heads): {overall*100:.2f}%")
    print(f"{'='*55}")
    return overall

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Train CNN murmur severity classifier')
    parser.add_argument('--colab',      action='store_true')
    parser.add_argument('--drive-root', default='/content/drive/MyDrive/cardiosense')
    parser.add_argument('--epochs',     type=int, default=150)
    parser.add_argument('--batch-size', type=int, default=16)
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
    # Stratify on the most meaningful primary label: murmur_present
    primary_key = 'murmur_present'
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

    # ── Explicit model save (safety net for Colab Drive sync) ─
    # ModelCheckpoint only writes best_model.keras mid-training when
    # val_loss improves. If the session disconnects before Drive syncs,
    # the file is lost. This explicit save guarantees it exists.
    final_model_path = output_dir / 'best_model.keras'
    model.save(str(final_model_path))
    print(f"[INFO] Final model saved to: {final_model_path}")

    # ── Save encoders ─────────────────────────────────────────
    for key, le in encoders.items():
        joblib.dump(le, output_dir / f'encoder_{key}.pkl')

    # Save n_classes config for inference
    with open(output_dir / 'config.json', 'w') as f:
        all_keys = list(LABEL_COLS.keys()) + ['murmur_present']
        json.dump({'n_classes': n_classes, 'label_keys': all_keys}, f)

    print(f"\n[INFO] All assets saved to: {output_dir}")
    print(f"\n{'='*60}")
    print(f"  FINAL OVERALL ACCURACY: {overall_acc*100:.2f}%")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
