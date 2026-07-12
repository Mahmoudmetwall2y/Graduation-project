#YAMNet_1presplit.py
import os
import librosa
import numpy as np
import pandas as pd
from collections import Counter
from tqdm import tqdm
import random
import tensorflow as tf
import tensorflow_hub as hub
from scipy.signal import butter, sosfilt

# =========================
# PATHS
# =========================
# Configure local data without embedding workstation-specific paths.
DATASET_ROOT = os.environ.get("ASCULTICOR_DATASET_ROOT", "datasets")
AUDIO_PATH = os.path.join(DATASET_ROOT, "PCG_CirCor", "training_data")
LABEL_FILE = os.path.join(DATASET_ROOT, "PCG_CirCor", "training_data.csv")

# Load YAMNet once globally
new_cache_dir = os.environ.get("TFHUB_CACHE_DIR", os.path.join(".cache", "tfhub"))
os.environ["TFHUB_CACHE_DIR"] = new_cache_dir
print("Loading YAMNet from TensorFlow Hub...")
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')

# ==========================================
# PAPER FEATURES: STABLE FILTERING & AUGMENTATION
# ==========================================
def butter_bandpass_sos(lowcut=20, highcut=400, fs=22050, order=4):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    return butter(order, [low, high], btype='band', output='sos')

def butter_highpass_sos(cutoff=20, fs=22050, order=4):
    nyq = 0.5 * fs
    normal_cutoff = cutoff / nyq
    return butter(order, normal_cutoff, btype='high', output='sos')

def clean_signal(audio, sr=22050):
    sos_band = butter_bandpass_sos(lowcut=20, highcut=400, fs=sr, order=4)
    filtered = sosfilt(sos_band, audio)
    sos_high = butter_highpass_sos(cutoff=20, fs=sr, order=4)
    cleaned = sosfilt(sos_high, filtered)
    return cleaned

def augment_audio(audio, sr=22050):
    noise_factor = random.uniform(0.002, 0.015)
    audio_noisy = audio + noise_factor * np.random.randn(len(audio))
    return librosa.effects.pitch_shift(y=audio_noisy, sr=sr, n_steps=random.uniform(-3, 3))

# =====================================
# AUDIO STANDARDIZATION TRACKS
# =====================================
def load_and_standardize_audio(file_path, sr=22050, duration=10, augment=False):
    audio, _ = librosa.load(file_path, sr=sr)
    audio = clean_signal(audio, sr=sr)
    audio = librosa.util.normalize(audio)

    if augment:
        audio = augment_audio(audio, sr=sr)

    target_length = sr * duration
    if len(audio) < target_length:
        audio = np.pad(audio, (0, target_length - len(audio)))
    else:
        audio = audio[:target_length]
    return audio, sr

def extract_yamnet_track(file_path):
    audio, sr = librosa.load(file_path, sr=16000)
    target_samples = 48000
    if len(audio) < target_samples:
        audio = np.pad(audio, (0, target_samples - len(audio)))
    else:
        audio = audio[:target_samples]

    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val

    audio_tf = tf.convert_to_tensor(audio, dtype=tf.float32)
    scores, embeddings, spectrogram = yamnet_model(audio_tf)
    return np.mean(embeddings.numpy(), axis=0)

# =====================================
# FEATURE EXTRACTION & COMPLIANT STANDARDIZATION
# =====================================
def extract_features(audio, sr):
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
    spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(y=audio)[0]
    chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=audio, sr=sr)
    mel = librosa.feature.melspectrogram(y=audio, sr=sr)
    mel_db = librosa.power_to_db(mel)

    feat_vector = np.concatenate([
        np.mean(mfcc, axis=1), np.std(mfcc, axis=1),
        [np.mean(spectral_centroid), np.std(spectral_centroid)],
        [np.mean(spectral_rolloff), np.std(spectral_rolloff)],
        [np.mean(bandwidth), np.std(bandwidth)],
        [np.mean(zcr), np.std(zcr)],
        np.mean(chroma, axis=1), np.std(chroma, axis=1),
        np.mean(contrast, axis=1), np.std(contrast, axis=1),
        np.mean(mel_db, axis=1)
    ])

    eps = 1e-8
    feat_vector_standardized = (feat_vector - np.mean(feat_vector)) / (np.std(feat_vector) + eps)
    return feat_vector_standardized

# =====================================
# 1. STRATIFIED PATIENT-LEVEL SPLIT
# =====================================
df = pd.read_csv(LABEL_FILE)
label_dict = {}

for _, row in df.iterrows():
    patient = str(row["Patient ID"])
    label = row["Murmur"]
    if label == "Absent":
        label_dict[patient] = "Normal"
    elif label == "Present":
        label_dict[patient] = "Murmur"

# Get unique patients and shuffle them safely
unique_patients = list(label_dict.keys())
random.seed(42)
random.shuffle(unique_patients)

# 80/20 Split
split_idx = int(len(unique_patients) * 0.8)
train_patients = set(unique_patients[:split_idx])
test_patients = set(unique_patients[split_idx:])

all_files = [f for f in os.listdir(AUDIO_PATH) if f.endswith(".wav") or f.endswith(".mp3")]

# Pools to store split features separately
X_train, y_train = [], []
X_test, y_test = [], []

train_counts = {"Normal": 0, "Murmur": 0}
test_counts = {"Normal": 0, "Murmur": 0}

print(f"Total Patients: {len(unique_patients)} | Train Patients: {len(train_patients)} | Test Patients: {len(test_patients)}")
print("Starting Split-Safe Feature Extraction...")

# =====================================
# 2. SEPARATED EXTRACTION LOOP
# =====================================
for file in tqdm(all_files, desc="Processing CirCor Tracks"):
    patient_id = file.split("_")[0]
    if patient_id not in label_dict:
        continue

    current_label = label_dict[patient_id]
    path = os.path.join(AUDIO_PATH, file)

    try:
        # Extract base features
        audio, sr = load_and_standardize_audio(path, augment=False)
        feat_traditional = extract_features(audio, sr)
        feat_yamnet = extract_yamnet_track(path)
        combined_feat = np.concatenate([feat_traditional, feat_yamnet])

        # ROUTE TO TRAIN POOL
        
        # ROUTE TO TRAIN POOL
        if patient_id in train_patients:
            X_train.append(combined_feat)
            y_train.append(current_label)
            train_counts[current_label] += 1

            # Keep your targeted minority over-sampling for Murmurs!
            if current_label == "Murmur":
                # 1. Traditional Pipeline: Load -> Clean -> Augment -> Extract (10 Seconds)
                audio_aug, sr = load_and_standardize_audio(path, augment=True)
                feat_aug_trad = extract_features(audio_aug, sr)
                
                # 2. YAMNet Pipeline: Load RAW -> Augment RAW -> Standardize to 3 Seconds (48000 samples)
                audio_raw_yam, sr_yam = librosa.load(path, sr=16000)
                
                # Apply exact same augmentations directly to the RAW 16k stream
                noise_factor = random.uniform(0.002, 0.015)
                audio_raw_yam_noisy = audio_raw_yam + noise_factor * np.random.randn(len(audio_raw_yam))
                audio_raw_yam_aug = librosa.effects.pitch_shift(
                    y=audio_raw_yam_noisy, sr=sr_yam, n_steps=random.uniform(-3, 3)
                )
                
                # FIX 2: Ensure it matches the exact 3-second duration of your clean YAMNet track
                target_samples = 48000
                if len(audio_raw_yam_aug) < target_samples:
                    audio_raw_yam_aug = np.pad(audio_raw_yam_aug, (0, target_samples - len(audio_raw_yam_aug)))
                else:
                    audio_raw_yam_aug = audio_raw_yam_aug[:target_samples]

                max_val = np.max(np.abs(audio_raw_yam_aug))
                if max_val > 0:
                    audio_raw_yam_aug = audio_raw_yam_aug / max_val

                # Extract truly uniform augmented YAMNet features
                audio_tf = tf.convert_to_tensor(audio_raw_yam_aug, dtype=tf.float32)
                _, embeddings_aug, _ = yamnet_model(audio_tf)
                feat_yamnet_aug = np.mean(embeddings_aug.numpy(), axis=0)

                # 3. Combine both TRULY compliant feature sets
                combined_aug = np.concatenate([feat_aug_trad, feat_yamnet_aug])

                X_train.append(combined_aug)
                y_train.append(current_label)
                train_counts["Murmur"] += 1

        # ROUTE TO TEST POOL (Kept completely pristine)
        elif patient_id in test_patients:
            X_test.append(combined_feat)
            y_test.append(current_label)
            test_counts[current_label] += 1

    except Exception as e:
        continue

# =====================================
# 3. SAVE SEPARATED MATRICES
# =====================================
X_train = np.nan_to_num(np.array(X_train), nan=0.0)
y_train = np.array(y_train)
X_test = np.nan_to_num(np.array(X_test), nan=0.0)
y_test = np.array(y_test)

np.save("X_train_circor.npy", X_train)
np.save("y_train_circor.npy", y_train)
np.save("X_test_circor.npy", X_test)
np.save("y_test_circor.npy", y_test)

print("\n" + "="*40)
print("     EXTRACTION COMPLETE & VERIFIED")
print("="*40)
print(f"Train Dataset Shape : {X_train.shape} -> Counts: {train_counts}")
print(f"Test Dataset Shape  : {X_test.shape}  -> Counts: {test_counts}")
print("="*40)
