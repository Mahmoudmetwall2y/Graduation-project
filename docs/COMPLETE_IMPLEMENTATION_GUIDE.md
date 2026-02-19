# AscultiCor - Complete End-to-End Implementation Guide

## Table of Contents
1. [Hardware Setup & Wiring](#1-hardware-setup--wiring)
2. [Training Your ML Models](#2-training-your-ml-models)
3. [Deploying Models to AscultiCor](#3-deploying-models-to-asculicor)
4. [Setting Up AscultiCor Application](#4-setting-up-asculicor-application)
5. [Adding ESP32 Devices](#5-adding-esp32-devices)
6. [System Integration & Testing](#6-system-integration--testing)
7. [Production Deployment](#7-production-deployment)

---

## 1. Hardware Setup & Wiring

### 1.1 Components Needed

**Core Components:**
- ESP32 Development Board (ESP32-WROOM-32 recommended)
- AD8232 ECG Sensor Module
- INMP441 I2S Microphone (for PCG/heart sounds)
- Jumper wires (20+ pieces)
- Breadboard or PCB
- USB cable for programming
- 3.3V Power supply (if not using USB)

**Optional but Recommended:**
- Status LED (3mm, any color)
- 220Ω resistor (for LED)
- Electrolytic capacitors (100µF, 10µF) for power stability
- PCB for permanent installation
- Enclosure/case

### 1.2 Complete Wiring Diagram

```
ESP32 GPIO Pinout:
                    ┌─────────────────────┐
                    │       ESP32         │
                    │    (Top View)       │
    ┌───────────────┤                     ├───────────────┐
    │  3.3V  ───────┤EN             GPIO23├────── MOSI    │
    │  GND   ───────┤GPIO3 (RX0)    GPIO22├────── SCL     │
    │  GPIO1 (TX0) ─┤GPIO1 (TX0)    GPIO1  │        TX0    │
    │  GPIO3 (RX0) ─┤GPIO3 (RX0)    GPIO3  │        RX0    │
    │  GPIO21 ──────┤GPIO21 (SDA)   GPIO21 │        SDA    │
    │  GPIO19 ──────┤GPIO19 (MISO)  GPIO19 │        MISO   │
    │  GPIO18 ──────┤GPIO18 (SCK)   GPIO18 │        SCK    │
    │  GPIO5  ──────┤GPIO5 (SS)     GPIO5  │        SS     │
    │  GPIO17 ──────┤GPIO17 (TX2)   GPIO17 │        TX2    │
    │  GPIO16 ──────┤GPIO16 (RX2)   GPIO16 │        RX2    │
    │  GPIO4  ──────┤GPIO4          GPIO4  │              │
    │  GPIO0  ──────┤GPIO0  (Boot)  GPIO0  │        Boot   │
    │  GPIO2  ──────┤GPIO2  (LED)   GPIO2  │◄────── Status LED
    │  GPIO15 ──────┤GPIO15 (MTDO)  GPIO15 │        MTDO   │
    │  GPIO13 ──────┤GPIO13 (MTCK)  GPIO13 │        MTCK   │
    │  GPIO12 ──────┤GPIO12 (MTDI)  GPIO12 │        MTDI   │
    │  GPIO14 ──────┤GPIO14 (MTMS)  GPIO14 │        MTMS   │
    │  GPIO27 ──────┤GPIO27         GPIO27 │◄────── I2S SCK (Mic)
    │  GPIO26 ──────┤GPIO26         GPIO26 │◄────── I2S WS (Mic)
    │  GPIO25 ──────┤GPIO25         GPIO25 │◄────── I2S SD (Mic)
    │  GPIO33 ──────┤GPIO33         GPIO33 │              │
    │  GPIO32 ──────┤GPIO32         GPIO32 │◄────── ECG Output
    │  GPIO35 ──────┤GPIO35         GPIO35 │◄────── ECG LO-
    │  GPIO34 ──────┤GPIO34         GPIO34 │◄────── ECG LO+
    │  GPIO39 ──────┤GPIO39 (SVN)   GPIO39 │              │
    │  GPIO36 ──────┤GPIO36 (SVP)   GPIO36 │              │
    │  VIN   ───────┤VIN            VIN    │              │
    │  GND   ───────┤GND            GND    │              │
    │  5V    ───────┤5V             5V     │              │
    │  3.3V  ───────┤3.3V           3.3V   │              │
    └───────────────┴─────────────────────┴───────────────┘
```

### 1.3 ECG Sensor (AD8232) Wiring

**AD8232 Pins:**
```
AD8232 Module:
┌──────────────────┐
│     AD8232       │
│  ┌───────────┐   │
│  │  +        │───┼──► 3.3V (ESP32)
│  │  -        │───┼──► GND (ESP32)
│  │  OUTPUT   │───┼──► GPIO32 (ESP32) [ECG Signal]
│  │  LO+      │───┼──► GPIO34 (ESP32) [Lead Off Detect +]
│  │  LO-      │───┼──► GPIO35 (ESP32) [Lead Off Detect -]
│  │  SDN      │───┼──► 3.3V (or GPIO for power control)
│  └───────────┘   │
└──────────────────┘
```

**Connection Steps:**
1. Connect AD8232 **3.3V** to ESP32 **3.3V**
2. Connect AD8232 **GND** to ESP32 **GND**
3. Connect AD8232 **OUTPUT** to ESP32 **GPIO32**
4. Connect AD8232 **LO+** to ESP32 **GPIO34**
5. Connect AD8232 **LO-** to ESP32 **GPIO35**
6. Connect AD8232 **SDN** to ESP32 **3.3V** (or control via GPIO)

**ECG Electrode Placement (3-lead configuration):**
```
Patient Body:
     ┌─────────────────────┐
     │                     │
     │    ◄── RA (White)   │──► Connects to AD8232 RA pin
     │                     │
     │  ◄── LA (Black)     │──► Connects to AD8232 LA pin
     │                     │
     │      ◄── RL (Red)   │──► Connects to AD8232 RL pin
     │                     │
     └─────────────────────┘

RA = Right Arm
LA = Left Arm  
RL = Right Leg (Reference)
```

### 1.4 Microphone (INMP441) Wiring for PCG

**INMP441 I2S Microphone Pins:**
```
INMP441 Module:
┌──────────────────┐
│    INMP441       │
│  ┌───────────┐   │
│  │  VDD      │───┼──► 3.3V (ESP32)
│  │  GND      │───┼──► GND (ESP32)
│  │  SD       │───┼──► GPIO25 (ESP32) [Serial Data]
│  │  WS       │───┼──► GPIO26 (ESP32) [Word Select/LRCK]
│  │  SCK      │───┼──► GPIO27 (ESP32) [Bit Clock/BCLK]
│  │  L/R      │───┼──► GND (Left Channel) or 3.3V (Right)
│  └───────────┘   │
└──────────────────┘
```

**Connection Steps:**
1. Connect INMP441 **VDD** to ESP32 **3.3V**
2. Connect INMP441 **GND** to ESP32 **GND**
3. Connect INMP441 **SD** to ESP32 **GPIO25**
4. Connect INMP441 **WS** to ESP32 **GPIO26**
5. Connect INMP441 **SCK** to ESP32 **GPIO27**
6. Connect INMP441 **L/R** to ESP32 **GND** (selects left channel)

**Microphone Placement for PCG:**
```
Chest Placement:
     ┌─────────────────────┐
     │                     │
     │    🔴 Aortic        │──► Place microphone here for aortic sounds
     │       (2nd ICS)     │
     │                     │
     │  🔴 Pulmonic        │──► Place microphone here for pulmonic sounds
     │     (2nd ICS left)  │
     │                     │
     │    🔴 Tricuspid     │──► Place microphone here for tricuspid sounds
     │      (4th ICS)      │
     │                     │
     │  🔴 Mitral          │──► Place microphone here for mitral sounds
     │    (5th ICS mid)    │
     │                     │
     └─────────────────────┘

ICS = Intercostal Space
Use stethoscope diaphragm or direct skin contact
```

### 1.5 Status LED Wiring

```
Status LED Connection:

ESP32 GPIO2 ────[220Ω]────►|──── GND
                          LED
                          (Anode) (Cathode)

When GPIO2 is HIGH, LED lights up
```

### 1.6 Power Supply Setup

**Option A: USB Power (Development)**
```
USB Cable ────► ESP32 Micro-USB Port
                │
                ├──► 5V for ESP32
                └──► 3.3V regulated on board
```

**Option B: External Power (Production)**
```
3.3V Power Supply:
┌──────────────┐
│   LM1117     │
│  3.3V Reg    │
└──────┬───────┘
       │
       ├──► ESP32 3.3V
       ├──► AD8232 3.3V
       ├──► INMP441 VDD
       └──► Common GND

Input: 5V from USB or battery
Output: Stable 3.3V for all components
```

### 1.7 Complete Wiring Checklist

**Before powering on, verify:**

- [ ] ESP32 GND connected to all component GNDs
- [ ] ESP32 3.3V connected to AD8232 VCC
- [ ] ESP32 3.3V connected to INMP441 VDD
- [ ] ECG OUTPUT → GPIO32
- [ ] ECG LO+ → GPIO34
- [ ] ECG LO- → GPIO35
- [ ] Mic SD → GPIO25
- [ ] Mic WS → GPIO26
- [ ] Mic SCK → GPIO27
- [ ] LED + → GPIO2 (with resistor)
- [ ] LED - → GND
- [ ] No short circuits between adjacent pins
- [ ] All connections secure

### 1.8 Physical Assembly Tips

**Breadboard Layout:**
```
Breadboard Top View:
┌──────────────────────────────────────────────────┐
│  ESP32    │  AD8232    │  INMP441    │  LED     │
│  (Center) │  (Left)    │  (Right)    │  (Top)   │
│           │            │             │          │
│ 3.3V ─────┼────────────┼─────────────┼────┐     │
│ GND  ─────┼────────────┼─────────────┼────┼──┐  │
│ GPIO32 ───┼──► OUT     │             │    │  │  │
│ GPIO34 ───┼──► LO+     │             │    │  │  │
│ GPIO35 ───┼──► LO-     │             │    │  │  │
│ GPIO25 ───┼────────────┼──► SD       │    │  │  │
│ GPIO26 ───┼────────────┼──► WS       │    │  │  │
│ GPIO27 ───┼────────────┼──► SCK      │    │  │  │
│ GPIO2  ───┼────────────┼─────────────┼──►[R]─┼─►│
└──────────────────────────────────────────────────┘
```

**Best Practices:**
1. Use short wires to reduce noise
2. Keep analog (ECG) and digital (Mic) circuits separated
3. Add decoupling capacitors near power pins
4. Use shielded cable for ECG electrodes if possible
5. Secure wires with hot glue or cable ties
6. Test on breadboard first, then solder to PCB

---

## 2. Training Your ML Models

### 2.1 PCG Classification Model (XGBoost)

**Purpose:** Classify heart sounds as Normal, Murmur, or Artifact

**Training Data Requirements:**
```python
# Required dataset structure
# X: Features (n_samples, 34)
#    - 13 MFCC means
#    - 13 MFCC standard deviations
#    - 6 spectral features (centroid, rolloff, bandwidth means & stds)
#    - 2 zero-crossing rate features (mean & std)
# y: Labels (n_samples,) with values [0, 1, 2]
#    0 = Normal, 1 = Murmur, 2 = Artifact
```

**Training Script:**

```python
# train_pcg_model.py
import xgboost as xgb
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import pickle
import librosa

# 1. Load and preprocess your data
def extract_features(audio_path, sr=22050):
    """Extract 34 features from PCG audio file"""
    # Load audio
    audio, _ = librosa.load(audio_path, sr=sr)
    
    # Extract MFCCs (13 coefficients)
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfccs, axis=1)
    mfcc_std = np.std(mfccs, axis=1)
    
    # Extract spectral features
    spectral_centroids = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
    spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
    spectral_bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(audio)[0]
    
    # Combine features
    features = np.concatenate([
        mfcc_mean,           # 13 features
        mfcc_std,            # 13 features
        [np.mean(spectral_centroids), np.std(spectral_centroids)],  # 2 features
        [np.mean(spectral_rolloff), np.std(spectral_rolloff)],      # 2 features
        [np.mean(spectral_bandwidth), np.std(spectral_bandwidth)],  # 2 features
        [np.mean(zcr), np.std(zcr)]                                  # 2 features
    ])
    
    return features

# 2. Prepare dataset
print("Loading dataset...")
# Load your labeled dataset
# X = np.array([extract_features(f) for f in audio_files])
# y = np.array(labels)  # 0=Normal, 1=Murmur, 2=Artifact

# Example with dummy data (replace with your actual data)
X = np.random.randn(1000, 34)  # 1000 samples, 34 features
y = np.random.randint(0, 3, 1000)  # Random labels

# 3. Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 4. Train XGBoost model
print("Training PCG classifier...")
model = xgb.XGBClassifier(
    n_estimators=100,
    max_depth=6,
    learning_rate=0.1,
    objective='multi:softprob',
    num_class=3,
    eval_metric='mlogloss',
    random_state=42
)

model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=True
)

# 5. Evaluate model
y_pred = model.predict(X_test)
print("\nClassification Report:")
print(classification_report(y_test, y_pred, 
                          target_names=['Normal', 'Murmur', 'Artifact']))

# 6. Save model
model_path = 'inference/models/pcg_classifier.pkl'
with open(model_path, 'wb') as f:
    pickle.dump(model, f)

print(f"\n✅ Model saved to {model_path}")
print(f"Training accuracy: {model.score(X_train, y_train):.4f}")
print(f"Test accuracy: {model.score(X_test, y_test):.4f}")
```

### 2.2 Murmur Severity Model (CNN with 6 Heads)

**Purpose:** Analyze murmur characteristics (location, timing, shape, grading, pitch, quality)

**Training Script:**

```python
# train_murmur_model.py
import tensorflow as tf
from tensorflow import keras
import numpy as np
import librosa

# 1. Prepare data
def preprocess_audio_for_cnn(audio_path, sr=22050, duration=10):
    """
    Convert audio to mel-spectrogram for CNN input
    Output shape: (431, 128, 1) for 10s audio
    """
    # Load and preprocess
    audio, _ = librosa.load(audio_path, sr=sr, duration=duration)
    
    # Generate mel-spectrogram
    mel_spec = librosa.feature.melspectrogram(
        y=audio, 
        sr=sr, 
        n_mels=128,
        hop_length=512
    )
    
    # Convert to dB
    mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
    
    # Resize to fixed shape (431 time steps for 10s)
    target_length = 431
    if mel_spec_db.shape[1] < target_length:
        # Pad
        pad_width = target_length - mel_spec_db.shape[1]
        mel_spec_db = np.pad(mel_spec_db, ((0, 0), (0, pad_width)), mode='constant')
    else:
        # Truncate
        mel_spec_db = mel_spec_db[:, :target_length]
    
    # Add channel dimension
    mel_spec_db = np.expand_dims(mel_spec_db, axis=-1)
    
    return mel_spec_db

# 2. Create multi-head CNN model
def create_murmur_severity_model():
    """
    Multi-output CNN for murmur characterization
    6 heads: location, timing, shape, grading, pitch, quality
    """
    # Input: Mel-spectrogram
    inputs = keras.Input(shape=(431, 128, 1))
    
    # Shared convolutional base
    x = keras.layers.Conv2D(32, (3, 3), activation='relu', padding='same')(inputs)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.MaxPooling2D((2, 2))(x)
    x = keras.layers.Dropout(0.25)(x)
    
    x = keras.layers.Conv2D(64, (3, 3), activation='relu', padding='same')(x)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.MaxPooling2D((2, 2))(x)
    x = keras.layers.Dropout(0.25)(x)
    
    x = keras.layers.Conv2D(128, (3, 3), activation='relu', padding='same')(x)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dropout(0.5)(x)
    
    # Shared dense layer
    shared = keras.layers.Dense(256, activation='relu')(x)
    shared = keras.layers.Dropout(0.5)(shared)
    
    # Head 1: Location (AV, MV, PV, TV) - 4 classes
    location = keras.layers.Dense(4, activation='softmax', name='location')(shared)
    
    # Head 2: Timing (systolic, diastolic, continuous) - 3 classes
    timing = keras.layers.Dense(3, activation='softmax', name='timing')(shared)
    
    # Head 3: Shape (4 types)
    shape = keras.layers.Dense(4, activation='softmax', name='shape')(shared)
    
    # Head 4: Grading (I/VI to VI/VI) - 6 classes
    grading = keras.layers.Dense(6, activation='softmax', name='grading')(shared)
    
    # Head 5: Pitch (low, medium, high) - 3 classes
    pitch = keras.layers.Dense(3, activation='softmax', name='pitch')(shared)
    
    # Head 6: Quality (4 types)
    quality = keras.layers.Dense(4, activation='softmax', name='quality')(shared)
    
    # Create model
    model = keras.Model(
        inputs=inputs,
        outputs=[location, timing, shape, grading, pitch, quality]
    )
    
    # Compile
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss={
            'location': 'categorical_crossentropy',
            'timing': 'categorical_crossentropy',
            'shape': 'categorical_crossentropy',
            'grading': 'categorical_crossentropy',
            'pitch': 'categorical_crossentropy',
            'quality': 'categorical_crossentropy'
        },
        loss_weights={
            'location': 1.0,
            'timing': 1.0,
            'shape': 1.0,
            'grading': 1.0,
            'pitch': 1.0,
            'quality': 1.0
        },
        metrics={
            'location': 'accuracy',
            'timing': 'accuracy',
            'shape': 'accuracy',
            'grading': 'accuracy',
            'pitch': 'accuracy',
            'quality': 'accuracy'
        }
    )
    
    return model

# 3. Prepare training data
print("Preparing dataset...")
# X = np.array([preprocess_audio_for_cnn(f) for f in murmur_audio_files])
# y_location = one_hot_encoded_location_labels
# y_timing = one_hot_encoded_timing_labels
# etc.

# Dummy data for example
X = np.random.randn(500, 431, 128, 1)
y_location = keras.utils.to_categorical(np.random.randint(0, 4, 500), 4)
y_timing = keras.utils.to_categorical(np.random.randint(0, 3, 500), 3)
y_shape = keras.utils.to_categorical(np.random.randint(0, 4, 500), 4)
y_grading = keras.utils.to_categorical(np.random.randint(0, 6, 500), 6)
y_pitch = keras.utils.to_categorical(np.random.randint(0, 3, 500), 3)
y_quality = keras.utils.to_categorical(np.random.randint(0, 4, 500), 4)

# 4. Train model
print("Training murmur severity model...")
model = create_murmur_severity_model()

history = model.fit(
    X,
    {
        'location': y_location,
        'timing': y_timing,
        'shape': y_shape,
        'grading': y_grading,
        'pitch': y_pitch,
        'quality': y_quality
    },
    validation_split=0.2,
    epochs=50,
    batch_size=16,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=5)
    ]
)

# 5. Save model
model_path = 'inference/models/murmur_severity.h5'
model.save(model_path)
print(f"\n✅ Model saved to {model_path}")

# Print final metrics
print("\nFinal training metrics:")
for metric, value in history.history.items():
    print(f"  {metric}: {value[-1]:.4f}")
```

### 2.3 ECG Prediction Model (BiLSTM)

**Purpose:** Predict if ECG is Normal or Abnormal

**Training Script:**

```python
# train_ecg_model.py
import tensorflow as tf
from tensorflow import keras
import numpy as np

# 1. Prepare ECG data
def preprocess_ecg(ecg_signal, target_length=500):
    """
    Preprocess ECG signal for BiLSTM
    Input: Raw ECG signal (variable length)
    Output: Fixed length (500 samples) normalized signal
    """
    # Resample to target length
    if len(ecg_signal) < target_length:
        # Pad
        pad_length = target_length - len(ecg_signal)
        ecg_signal = np.pad(ecg_signal, (0, pad_length), mode='edge')
    else:
        # Take last window
        ecg_signal = ecg_signal[-target_length:]
    
    # Z-score normalization
    mean = np.mean(ecg_signal)
    std = np.std(ecg_signal)
    if std > 0:
        ecg_signal = (ecg_signal - mean) / std
    
    return ecg_signal

# 2. Create BiLSTM model
def create_ecg_model():
    """
    Bidirectional LSTM for ECG classification
    Input: (batch, 500, 1) - 1 second at 500Hz
    Output: (batch, 2) - [Normal, Abnormal] probabilities
    """
    inputs = keras.Input(shape=(500, 1))
    
    # First BiLSTM layer
    x = keras.layers.Bidirectional(
        keras.layers.LSTM(64, return_sequences=True)
    )(inputs)
    x = keras.layers.Dropout(0.3)(x)
    
    # Second BiLSTM layer
    x = keras.layers.Bidirectional(
        keras.layers.LSTM(32)
    )(x)
    x = keras.layers.Dropout(0.3)(x)
    
    # Dense layers
    x = keras.layers.Dense(64, activation='relu')(x)
    x = keras.layers.Dropout(0.5)(x)
    x = keras.layers.Dense(32, activation='relu')(x)
    
    # Output layer
    outputs = keras.layers.Dense(2, activation='softmax', name='prediction')(x)
    
    # Create model
    model = keras.Model(inputs=inputs, outputs=outputs)
    
    # Compile
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model

# 3. Prepare training data
print("Preparing ECG dataset...")
# X = np.array([preprocess_ecg(signal) for signal in ecg_signals])
# X = np.expand_dims(X, axis=-1)  # Add channel dimension
# y = keras.utils.to_categorical(labels, 2)  # One-hot encode

# Dummy data
X = np.random.randn(1000, 500, 1)
y = keras.utils.to_categorical(np.random.randint(0, 2, 1000), 2)

# Split
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# 4. Train
print("Training ECG model...")
model = create_ecg_model()

history = model.fit(
    X_train, y_train,
    validation_data=(X_test, y_test),
    epochs=50,
    batch_size=32,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
        keras.callbacks.ModelCheckpoint(
            'best_ecg_model.h5',
            save_best_only=True,
            monitor='val_accuracy'
        )
    ]
)

# 5. Evaluate
print("\nEvaluating model...")
test_loss, test_acc = model.evaluate(X_test, y_test)
print(f"Test accuracy: {test_acc:.4f}")

# 6. Save
model_path = 'inference/models/ecg_predictor.h5'
model.save(model_path)
print(f"\n✅ Model saved to {model_path}")
```

---

## 3. Deploying Models to AscultiCor

### 3.1 Directory Structure

Create the models directory:
```bash
mkdir -p inference/models
touch inference/models/README.md
```

### 3.2 Copy Trained Models

After training, copy your models:
```bash
# From your training directory
cp pcg_classifier.pkl inference/models/
cp murmur_severity.h5 inference/models/
cp ecg_predictor.h5 inference/models/
```

### 3.3 Verify Models

Check that models load correctly:
```python
# verify_models.py
import pickle
import tensorflow as tf

print("Verifying models...")

# Test PCG model
with open('inference/models/pcg_classifier.pkl', 'rb') as f:
    pcg_model = pickle.load(f)
print("✅ PCG model loaded")

# Test Murmur model
murmur_model = tf.keras.models.load_model('inference/models/murmur_severity.h5')
print("✅ Murmur model loaded")

# Test ECG model
ecg_model = tf.keras.models.load_model('inference/models/ecg_predictor.h5')
print("✅ ECG model loaded")

print("\nAll models ready for deployment!")
```

### 3.4 Disable Demo Mode

Edit `docker-compose.yml`:
```yaml
inference:
  environment:
    - ENABLE_DEMO_MODE=false  # Set to false to use real models
```

---

## 4. Setting Up AscultiCor Application

### 4.1 Prerequisites Check

Ensure you have:
- [ ] Docker Desktop installed and running
- [ ] Supabase account (free tier)
- [ ] Git repository cloned
- [ ] Models trained and in `inference/models/`

### 4.2 Environment Configuration

Create `.env` file:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Supabase Configuration (from Supabase dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# MQTT Configuration
MQTT_USERNAME=asculticor
MQTT_PASSWORD=asculticor123

# Enable real models (not demo)
ENABLE_DEMO_MODE=false
```

### 4.3 Database Setup

**Step 1: Run Migrations**

Go to Supabase Dashboard → SQL Editor → New Query

Run migration 1:
```sql
-- Copy contents from supabase/migrations/001_initial_schema.sql
-- Click Run
```

Run migration 2:
```sql
-- Copy contents from supabase/migrations/002_device_management_enhancement.sql
-- Click Run
```

**Step 2: Run Seed Data**

Update `supabase/seed.sql` with your user UUID, then run it in SQL Editor.

### 4.4 Start the Application

```bash
# Build and start all services
docker-compose up --build

# Wait for services to start (about 1-2 minutes)
# Check logs:
docker-compose logs -f
```

Verify services are running:
- Frontend: http://localhost:3000
- API: http://localhost:8000/health
- MQTT: mqtt://localhost:1883

---

## 5. Adding ESP32 Devices

### 5.1 Register Device in Web App

1. Open http://localhost:3000
2. Login with your credentials
3. Go to "Device Management"
4. Click "Add Device"
5. Fill in:
   - Device Name: "Patient Room 101"
   - Device Type: ESP32
6. Click "Create Device"
7. **SAVE THE CREDENTIALS** (you'll only see them once!)

**Credentials Format:**
```
Device ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Secret Key: asc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Organization ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 5.2 Configure ESP32 Firmware

Update `docs/HARDWARE_INTEGRATION.md` ESP32 code with your credentials:

```cpp
// Device Configuration - UPDATE THESE!
const char* device_id = "YOUR_DEVICE_ID";
const char* device_secret = "YOUR_SECRET_KEY";
const char* org_id = "YOUR_ORG_ID";

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Broker (your computer's IP)
const char* mqtt_server = "192.168.1.XXX";  // Get from `ipconfig`
const int mqtt_port = 1883;
```

### 5.3 Flash ESP32

**Using Arduino IDE:**
1. Install ESP32 board support
2. Install libraries: PubSubClient, ArduinoJson
3. Select board: "ESP32 Dev Module"
4. Select port (COMx on Windows, /dev/ttyUSB0 on Linux)
5. Click Upload

**Using PlatformIO:**
```bash
cd esp32_firmware
pio run --target upload
```

### 5.4 Power On and Verify

1. Connect ESP32 to power
2. Open Serial Monitor (115200 baud)
3. You should see:
```
==================================
AscultiCor ESP32 Starting...
==================================
WiFi connected
IP address: 192.168.1.XXX
Session ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Connecting to MQTT...
connected
Starting data streaming...
Streaming started!
Duration: 10 seconds
```

4. Check web app - device should show as "online"

---

## 6. System Integration & Testing

### 6.1 Test Data Flow

**Step 1: Verify MQTT Connection**
```bash
# Subscribe to all topics
mosquitto_sub -h localhost -p 1883 -t "org/#" -v

# You should see messages when ESP32 connects
```

**Step 2: Check Inference Service**
```bash
# Check health
curl http://localhost:8000/health

# Should return:
# {"status": "healthy", "service": "AscultiCor Inference Service"}
```

**Step 3: Verify Database**
In Supabase SQL Editor:
```sql
-- Check devices
SELECT id, device_name, status, last_seen_at FROM devices;

-- Check sessions
SELECT id, device_id, status, created_at FROM sessions ORDER BY created_at DESC;

-- Check predictions
SELECT session_id, modality, model_name, created_at FROM predictions ORDER BY created_at DESC;
```

### 6.2 Test Complete Workflow

1. **Start Session**
   - Click "New Session" in web app
   - Select your device
   - Click "Create"

2. **Stream Data**
   - ESP32 automatically starts streaming when session is created
   - Or manually trigger from ESP32

3. **Monitor Progress**
   - Watch session status: created → streaming → processing → done
   - Check real-time updates every 3 seconds

4. **View Results**
   - Go to session detail page
   - See PCG classification (Normal/Murmur/Artifact)
   - See ECG prediction (Normal/Abnormal)
   - See murmur severity details (if applicable)

5. **Generate LLM Report**
   - Click "LLM Report" button
   - Wait 2-3 seconds
   - View AI-generated analysis

### 6.3 Add Multiple Devices

Repeat section 5 for each additional ESP32:
1. Register in web app
2. Note credentials
3. Update firmware with new device_id
4. Flash and deploy
5. Each device gets its own dashboard!

---

## 7. Production Deployment

### 7.1 Deploy to Cloud

**Option A: Railway (Easiest)**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy inference service
cd inference
railway init
railway up

# Deploy frontend
cd ../frontend
railway init
railway up
```

**Option B: AWS (Scalable)**
1. Deploy MQTT: AWS IoT Core
2. Deploy inference: ECS/Fargate
3. Deploy frontend: S3 + CloudFront

See `docs/CLOUD_DEPLOYMENT.md` for detailed AWS setup.

### 7.2 Update ESP32 for Cloud

Change MQTT broker to cloud endpoint:
```cpp
// Local development
// const char* mqtt_server = "192.168.1.100";

// Production (HiveMQ Cloud)
const char* mqtt_server = "your-cluster.hivemq.cloud";
const int mqtt_port = 8883;
```

### 7.3 Monitoring

Set up monitoring:
- Uptime monitoring: UptimeRobot
- Logs: CloudWatch or LogDNA
- Metrics: Datadog or Grafana

---

## Quick Reference Commands

```bash
# Start everything
docker-compose up --build

# View logs
docker-compose logs -f [service_name]

# Stop everything
docker-compose down

# Rebuild specific service
docker-compose up --build inference

# Access database
psql -h your-db-host -U postgres

# Test MQTT
mosquitto_sub -h localhost -t "org/#" -v

# Check API health
curl http://localhost:8000/health
```

---

## Troubleshooting

**Device Not Connecting:**
- Check WiFi credentials
- Verify MQTT broker IP
- Check firewall settings
- Review ESP32 serial output

**No Predictions:**
- Check models are in inference/models/
- Verify ENABLE_DEMO_MODE=false
- Check inference service logs

**Database Issues:**
- Verify Supabase credentials
- Check RLS policies
- Ensure migrations ran successfully

**Frontend Not Updating:**
- Check browser console for errors
- Verify polling is working (check Network tab)
- Try hard refresh (Ctrl+F5)

---

## Summary Checklist

- [ ] Hardware wired correctly (ECG + Mic + LED)
- [ ] ML models trained and tested
- [ ] Models copied to inference/models/
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Docker services running
- [ ] First device registered
- [ ] ESP32 flashed with credentials
- [ ] Device connecting and streaming
- [ ] Predictions appearing in web app
- [ ] LLM reports generating
- [ ] Multiple devices added (if needed)

**Congratulations!** Your AscultiCor system is fully operational! 🎉
