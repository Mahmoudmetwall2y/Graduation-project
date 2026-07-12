import os
import librosa
import numpy as np
from collections import Counter
from tqdm import tqdm
import warnings
import noisereduce as nr
import tensorflow as tf
import tensorflow_hub as hub
from scipy.signal import butter, sosfilt

warnings.filterwarnings("ignore", category=UserWarning)

# =====================================
# DATASET ROOT
# =====================================
DATASET_PATH = os.environ.get("ASCULTICOR_DATASET_PATH", os.path.join("datasets", "archive"))

# Load YAMNet globally to ensure matching 1024-dimensional feature embeddings
print("Loading YAMNet from TensorFlow Hub...")
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')

# ==========================================
# PAPER FEATURES: STABLE FILTERING (SOS) & NOISE REDUCTION
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
    # 1. Advanced Noise Reduction
    audio_denoised = nr.reduce_noise(y=audio, sr=sr, stationary=True)
    
    # 2. Stable Bandpass filtering (20-400Hz)
    sos_band = butter_bandpass_sos(lowcut=20, highcut=400, fs=sr, order=4)
    filtered = sosfilt(sos_band, audio_denoised)
    
    # 3. High-pass filter to drop baseline wander
    sos_high = butter_highpass_sos(cutoff=20, fs=sr, order=4)
    cleaned = sosfilt(sos_high, filtered)
    return cleaned

# =====================================
# AUDIO STANDARDIZATION & PREPROCESSING PIPELINES
# =====================================
def load_audio_traditional(path, sr=22050, duration=10):
    audio, _ = librosa.load(path, sr=sr)
    
    # Apply paper preprocessing
    audio = clean_signal(audio, sr=sr)
    audio = librosa.util.normalize(audio)
    
    target = sr * duration
    if len(audio) < target:
        audio = np.pad(audio, (0, target - len(audio)))
    else:
        audio = audio[:target]
    return audio, sr

def extract_yamnet_track(file_path):
    # Resample to 16kHz and clip to 3s as required by YAMNet specs
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
# FEATURE EXTRACTION (YOUR ORIGINAL SPECTRAL BLOCK)
# =====================================
def extract_features(audio, sr):
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(audio)[0]
    chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=audio, sr=sr)
    mel = librosa.feature.melspectrogram(y=audio, sr=sr)
    mel_db = librosa.power_to_db(mel)
    
    features = np.concatenate([
        np.mean(mfcc, axis=1), np.std(mfcc, axis=1),
        [np.mean(centroid), np.std(centroid)],
        [np.mean(rolloff), np.std(rolloff)],
        [np.mean(bandwidth), np.std(bandwidth)],
        [np.mean(zcr), np.std(zcr)],
        np.mean(chroma, axis=1), np.std(chroma, axis=1),               
        np.mean(contrast, axis=1), np.std(contrast, axis=1),           
        np.mean(mel_db, axis=1)
    ])
    return features

# =====================================
# LABEL MAP (UNTOUCHED ORIGINAL)
# =====================================
label_map = {
    "normal": "Artifact", 
    "extrahls": "Artifact",
    "extrastole": "Artifact",
    "murmur": "Artifact",
    "Aunlabelledtest": "Artifact",  
    "Bunlabelledtest": "Artifact",
    "noisymurmur": "Artifact",
    "artifact": "Artifact",
    "noisynormal": "Artifact"
}

# --- 1. PREPARATION: Gather all valid files first (UNTOUCHED ORIGINAL) ---
wav_files = []
print("Searching for files in folders...")
for root, dirs, files in os.walk(DATASET_PATH):
    for file in files:
        if file.endswith(".wav"):
            full_path = os.path.join(root, file)
            wav_files.append(full_path)

# --- 2. EXTRACTION LOOP ---
features = []
labels = []
errors = 0
total_scanned = 0

print(f"Found {len(wav_files)} total files....")

for path in tqdm(wav_files, desc="Overall Progress"):
    file_name = os.path.basename(path).lower()
    parent_dir = os.path.basename(os.path.dirname(path)).lower()
    
    total_scanned += 1
    label_prefix = file_name.split("__")[0]

    # --- YOUR UNTOUCHED FOLDER LOGIC ---
    if "unlabelledtest" in file_name or parent_dir in ["set_a", "set_b"]:
        if label_prefix in label_map:
            label = label_map[label_prefix]
        else:
            label = "Artifact"
    elif label_prefix in label_map:
        label = label_map[label_prefix]
    else:
        continue 

    # --- INTEGRATED FEATURE EXTRACTION TRACKS ---
    try:
        # Extract 200 traditional features with paper filtering
        audio, sr = load_audio_traditional(path)
        feat_traditional = extract_features(audio, sr)
        
        # Extract 1024 YAMNet deep features
        feat_yamnet = extract_yamnet_track(path)
        
        # Merge them safely into 1224 dimensions
        combined_feat = np.concatenate([feat_traditional, feat_yamnet])
        
        features.append(combined_feat)
        labels.append(label)
    except Exception:
        errors += 1

# --- 3. FINAL SAVE & STATS ---
if len(features) == 0:
    print("\n❌ Error: No samples were extracted. Verify folder structure.")
else:
    X = np.array(features)
    y = np.array(labels)

    # Convert any lingering math artifacts to valid numbers
    X = np.nan_to_num(X, nan=0.0)

    np.save("X_archive.npy", X)
    np.save("y_archive.npy", y)

    print("\n" + "="*40)
    print("ARCHIVE EXTRACTION COMPLETE")
    print("="*40)
    print(f"Total Scanned: {total_scanned}")
    print(f"Valid saved  : {len(X)}")
    print(f"Errors       : {errors}")
    print("-" * 40)
    print("Class Distribution:")
    counts = Counter(y)
    for cls, count in counts.items():
        print(f" - {cls:10}: {count}")
    print("="*40)
