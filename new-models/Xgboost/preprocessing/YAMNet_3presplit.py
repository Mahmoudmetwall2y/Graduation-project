#YAMNet_3presplit.py
import os
import numpy as np
import pandas as pd
import librosa
from collections import Counter
from tqdm import tqdm
import warnings
import random
import tensorflow as tf
import tensorflow_hub as hub
from scipy.signal import butter, sosfilt

warnings.filterwarnings("ignore", category=UserWarning)

# =====================================
# DATASET ROOT
# =====================================
DATASET_PATH = os.environ.get(
    "ASCULTICOR_DATASET_PATH",
    os.path.join("datasets", "classification-of-heart-sound-recordings"),
)
new_cache_dir = os.environ.get("TFHUB_CACHE_DIR", os.path.join(".cache", "tfhub"))
os.environ["TFHUB_CACHE_DIR"] = new_cache_dir
print("Loading YAMNet from TensorFlow Hub...")
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')

# ==========================================
# 1) d) Noise Filtering and Cleaning
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

def clean_signal_paper(audio, sr=22050):

    sos_band = butter_bandpass_sos(lowcut=20, highcut=400, fs=sr, order=4)
    filtered = sosfilt(sos_band, audio)
    sos_high = butter_highpass_sos(cutoff=20, fs=sr, order=4)
    cleaned = sosfilt(sos_high, filtered)
    return cleaned

# ==========================================
# 1) g) Data Augmentation
# ==========================================
def augment_audio_paper(audio, sr=22050):
    noise_factor = random.uniform(0.002, 0.015)
    audio_noisy = audio + noise_factor * np.random.randn(len(audio))
    return librosa.effects.pitch_shift(y=audio_noisy, sr=sr, n_steps=random.uniform(-3, 3))

# =====================================
# AUDIO STANDARDIZATION TRACKS (a, b, c, h)
# =====================================
def load_traditional_track(file_path, sr=22050, augment=False):
    audio, _ = librosa.load(file_path, sr=sr)
    audio = clean_signal_paper(audio, sr=sr)
    audio = librosa.util.normalize(audio)

    if augment:
        audio = augment_audio_paper(audio, sr=sr)

    target_length = sr * 10
    if len(audio) < target_length:
        audio = np.pad(audio, (0, target_length - len(audio)))
    else:
        audio = audio[:target_length]
    return audio, sr

def load_yamnet_track(file_path):
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
# 1) e) Feature Extraction & Spectral Features
# =====================================
def extract_paper_features(audio, sr):
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(audio)[0]
    chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=audio, sr=sr)
    mel = librosa.feature.melspectrogram(y=audio, sr=sr)
    mel_db = librosa.power_to_db(mel)

    feat_vector = np.concatenate([
        np.mean(mfcc, axis=1), np.std(mfcc, axis=1),
        [np.mean(centroid), np.std(centroid)],
        [np.mean(rolloff), np.std(rolloff)],
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
# PRE-SCANNING & TRACK SPLITTING
# =====================================
print("Searching for files and matching labels...")
tasks = []

for folder in os.listdir(DATASET_PATH):
    folder_path = os.path.join(DATASET_PATH, folder)
    if not os.path.isdir(folder_path):
        continue

    reference_file = os.path.join(folder_path, "REFERENCE.csv")
    if not os.path.exists(reference_file):
        continue

    df = pd.read_csv(reference_file, header=None)
    label_dict = {}
    for _, row in df.iterrows():
        file_id = str(row[0]).strip()
        label_val = int(row[1])
        if label_val == 1:
            label_dict[file_id] = "Murmur"
        elif label_val == -1:
            label_dict[file_id] = "Normal"

    for file in os.listdir(folder_path):
        if file.endswith(".wav"):
            file_id = file.replace(".wav", "").strip()
            if file_id in label_dict:
                wav_path = os.path.join(folder_path, file)
                tasks.append((wav_path, label_dict[file_id]))

# Perform 80/20 Split on Tasks list BEFORE extraction loop
random.seed(42)
random.shuffle(tasks)

split_idx = int(len(tasks) * 0.8)
train_tasks = tasks[:split_idx]
test_tasks = tasks[split_idx:]

# Arrays to store training and testing pools separately
X_train, y_train = [], []
X_test, y_test = [], []

train_counts = {"Murmur": 0, "Normal": 0}
test_counts = {"Murmur": 0, "Normal": 0}
errors = 0

# =====================================
# EXTRACTION: TRAINING SET TRACK
# =====================================
print(f"\nProcessing Training Set ({len(train_tasks)} files)...")
for wav_path, label in tqdm(train_tasks, desc="Training Track", unit="file"):
    try:
        audio, sr = load_traditional_track(wav_path, augment=False)
        feat_traditional = extract_paper_features(audio, sr)
        feat_yamnet = load_yamnet_track(wav_path)

        combined_feat = np.concatenate([feat_traditional, feat_yamnet])
        X_train.append(combined_feat)
        y_train.append(label)
        train_counts[label] += 1

        # Augment Murmur files ONLY inside this Training block
        if label == "Murmur":
            # 1. Traditional Pipeline: Load -> Clean -> Augment -> Extract
            audio_trad_aug, sr = load_traditional_track(wav_path, augment=True)
            feat_aug_trad = extract_paper_features(audio_trad_aug, sr)
            
            # 2. YAMNet Pipeline: Load RAW -> Augment RAW -> Extract YAMNet
            # We load the raw file at 16k, exactly like your original function, BUT we augment it!
            audio_raw_yam, sr_yam = librosa.load(wav_path, sr=16000)
            
            # Apply the exact same pitch/noise transformations directly to the raw signal
            noise_factor = random.uniform(0.002, 0.015)
            audio_raw_yam_noisy = audio_raw_yam + noise_factor * np.random.randn(len(audio_raw_yam))
            audio_raw_yam_aug = librosa.effects.pitch_shift(
                y=audio_raw_yam_noisy, sr=sr_yam, n_steps=random.uniform(-3, 3)
            )
            
            # Standardize length to 48000 samples (just like your load_yamnet_track does)
            target_samples = 48000
            if len(audio_raw_yam_aug) < target_samples:
                audio_raw_yam_aug = np.pad(audio_raw_yam_aug, (0, target_samples - len(audio_raw_yam_aug)))
            else:
                audio_raw_yam_aug = audio_raw_yam_aug[:target_samples]

            max_val = np.max(np.abs(audio_raw_yam_aug))
            if max_val > 0:
                audio_raw_yam_aug = audio_raw_yam_aug / max_val

            # Pass the augmented RAW audio to YAMNet
            audio_tf = tf.convert_to_tensor(audio_raw_yam_aug, dtype=tf.float32)
            _, embeddings_aug, _ = yamnet_model(audio_tf)
            feat_yamnet_aug = np.mean(embeddings_aug.numpy(), axis=0)

            # 3. Combine both truly synced feature profiles
            combined_aug = np.concatenate([feat_aug_trad, feat_yamnet_aug])

            X_train.append(combined_aug)
            y_train.append(label)
            train_counts["Murmur"] += 1

    except Exception as e:
        errors += 1

# =====================================
# EXTRACTION: TESTING SET TRACK (No Augmentation)
# =====================================
print(f"\nProcessing Testing Set ({len(test_tasks)} files)...")
for wav_path, label in tqdm(test_tasks, desc="Testing Track", unit="file"):
    try:
        audio, sr = load_traditional_track(wav_path, augment=False)
        feat_traditional = extract_paper_features(audio, sr)
        feat_yamnet = load_yamnet_track(wav_path)

        combined_feat = np.concatenate([feat_traditional, feat_yamnet])
        X_test.append(combined_feat)
        y_test.append(label)
        test_counts[label] += 1

    except Exception as e:
        errors += 1

# =====================================
# SAVE INDEPENDENT ARRAYS
# =====================================
if len(X_train) == 0 or len(X_test) == 0:
    print("\n❌ Error: Missing split data arrays.")
else:
    X_train = np.nan_to_num(np.array(X_train), nan=0.0)
    y_train = np.array(y_train)
    X_test = np.nan_to_num(np.array(X_test), nan=0.0)
    y_test = np.array(y_test)

    np.save("X_train_physio.npy", X_train)
    np.save("y_train_physio.npy", y_train)
    np.save("X_test_physio.npy", X_test)
    np.save("y_test_physio.npy", y_test)

    print("\n" + "="*40)
    print("PHYSIONET 2016 SPLIT-SAFE SEPARATION COMPLETE")
    print("="*40)
    print(f"Train Dataset Feature Shape: {X_train.shape}")
    print(f"Train Dataset Distribution : {Counter(y_train)}")
    print("-" * 40)
    print(f"Test Dataset Feature Shape : {X_test.shape}")
    print(f"Test Dataset Distribution  : {Counter(y_test)}")
    print(f"Total Skipped Errors       : {errors}")
    print("="*40)
