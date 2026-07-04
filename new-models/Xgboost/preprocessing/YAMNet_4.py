import os
import librosa
import numpy as np
import pandas as pd
from tqdm import tqdm
import warnings
import noisereduce as nr
import tensorflow as tf
import tensorflow_hub as hub
from scipy.signal import butter, sosfilt

warnings.filterwarnings("ignore", category=UserWarning)

# --- 1. CONFIGURATION (UNTOUCHED ORIGINAL SETTINGS) ---
DATASET_PATH = r"C:\Users\Nada\Desktop\Ai Graduation Project\Datasets\BMD-HS-Dataset-main\train"
CSV_PATH = r"C:\Users\Nada\Desktop\Ai Graduation Project\Datasets\BMD-HS-Dataset-main\train.csv" 
SR = 22050
DURATION = 10

# Load YAMNet globally to extract identical 1024-dimensional feature representations
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
    # Explicitly enforce 32-bit floating point precision for noisereduce safety
    audio = np.asarray(audio, dtype=np.float32)
    
    # 1. Advanced stationary noise reduction
    audio_denoised = nr.reduce_noise(y=audio, sr=sr, stationary=True)
    
    # 2. Bandpass filtering (20-400Hz) using stable Second-Order Sections (SOS)
    sos_band = butter_bandpass_sos(lowcut=20, highcut=400, fs=sr, order=4)
    filtered = sosfilt(sos_band, audio_denoised)
    
    # 3. High-pass filter baseline wander removal
    sos_high = butter_highpass_sos(cutoff=20, fs=sr, order=4)
    cleaned = sosfilt(sos_high, filtered)
    return cleaned

# --- 2. UPDATED EXTRACTION PIPELINES ---
def load_audio_traditional(path, sr=SR, duration=DURATION):
    audio, _ = librosa.load(path, sr=sr)
    
    # Clean and clean signal transients based on research parameters
    audio = clean_signal(audio, sr=sr)
    audio = librosa.util.normalize(audio)
    
    target = sr * duration
    if len(audio) < target:
        audio = np.pad(audio, (0, target - len(audio)))
    else:
        audio = audio[:target]
    return audio, sr

def extract_yamnet_track(file_path):
    # Specialized YAMNet processing pathway (Resampled to 16kHz, bounded to 3 seconds)
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

# --- 3. PROCESSING LOOP (UNTOUCHED LOGIC) ---
df = pd.read_csv(CSV_PATH)
features_list = []
labels_list = []

print(f"Processing BMD-HS clinical dataset...")

for _, row in tqdm(df.iterrows(), total=len(df)):
    for i in range(1, 9):
        file_id = row[f'recording_{i}']
        if pd.isna(file_id): continue
        
        path = os.path.join(DATASET_PATH, f"{file_id}.wav")
        
        if os.path.exists(path):
            try:
                # Determine Label (UNTOUCHED ORIGINAL)
                if row['N'] == 1:
                    label = "Normal"
                else:
                    label = "Murmur"
                
                # Extract combined target structural matrices
                audio, sr = load_audio_traditional(path)
                feat_traditional = extract_features(audio, sr)
                
                # Fetch deeper 1024-dimension sequence profile 
                feat_yamnet = extract_yamnet_track(path)
                
                # Build structurally unified array mapping 1224 points
                combined_feat = np.concatenate([feat_traditional, feat_yamnet])
                
                features_list.append(combined_feat)
                labels_list.append(label)
            except Exception:
                continue

# --- 4. SAVE ---
if len(features_list) == 0:
    print("\n❌ Error: Processed 0 samples. Verify your CSV recording IDs and paths.")
else:
    X_buet = np.array(features_list)
    y_buet = np.array(labels_list)

    # Cast infinity or empty array math nodes back to balanced zero points
    X_buet = np.nan_to_num(X_buet, nan=0.0)

    np.save("X_buet.npy", X_buet)
    np.save("y_buet.npy", y_buet)

    print(f"\nSuccess! X_buet shape: {X_buet.shape}")
    