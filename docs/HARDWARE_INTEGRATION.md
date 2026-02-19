# AscultiCor - Hardware Integration Guide

## Overview

This guide explains how to connect real ESP32 hardware with sensors and deploy trained ML models for real-time inference.

## Architecture for Real Hardware

```
┌─────────────┐      WiFi/MQTT      ┌──────────────┐
│   ESP32     │  ────────────────>  │   Inference  │
│  + Sensors  │                     │   Service    │
└─────────────┘                     └──────┬───────┘
                                           │
                                           │ Supabase
                                           ▼
                                  ┌─────────────────┐
                                  │   Next.js       │
                                  │   Frontend      │
                                  └─────────────────┘
```

## Step 1: ESP32 Hardware Setup

### Required Components

1. **ESP32 Development Board** (ESP32-WROOM-32 recommended)
2. **ECG Sensor** (AD8232 or MAX30003)
3. **Microphone Module** (INMP441 or MAX4466 for PCG)
4. **Power Supply** (USB or LiPo battery)

### Wiring Diagram

```
ESP32 Pin Connections:

ECG Sensor (AD8232):
- VCC  -> 3.3V
- GND  -> GND
- LO+  -> GPIO 34 (ADC)
- LO-  -> GPIO 35 (ADC)
- OUTPUT -> GPIO 32 (ADC)

Microphone (INMP441 - I2S):
- VDD  -> 3.3V
- GND  -> GND
- SD   -> GPIO 25
- WS   -> GPIO 26
- SCK  -> GPIO 27

Status LED:
- Anode -> GPIO 2 (with 220Ω resistor)
- Cathode -> GND
```

## Step 2: ESP32 Firmware

### Arduino IDE Setup

1. Install ESP32 board support:
   - File → Preferences → Additional Board Manager URLs
   - Add: `https://dl.espressif.com/dl/package_esp32_index.json`
   - Tools → Board → Board Manager → Search "ESP32" → Install

2. Install required libraries:
   - PubSubClient (MQTT)
   - ArduinoJson
   - WiFiManager

### ESP32 Code (asculticor_esp32.ino)

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>

// ============== CONFIGURATION ==============
// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Broker (your Docker host IP or cloud)
const char* mqtt_server = "192.168.1.100";  // Change to your broker IP
const int mqtt_port = 1883;
const char* mqtt_user = "asculticor";
const char* mqtt_pass = "asculticor123";

// Device & Session Info
const char* org_id = "00000000-0000-0000-0000-000000000001";
const char* device_id = "00000000-0000-0000-0000-000000000004";
char session_id[37];  // Will be generated

// Sampling Configuration
const int ECG_SAMPLE_RATE = 500;  // Hz
const int PCG_SAMPLE_RATE = 22050;  // Hz
const int ECG_BUFFER_SIZE = 500;  // 1 second of ECG
const int PCG_CHUNK_SIZE = 1024;  // Bytes per MQTT chunk

// ============== HARDWARE PINS ==============
const int ECG_PIN = 32;
const int LED_PIN = 2;

// ============== I2S CONFIG FOR PCG ==============
#define I2S_WS 26
#define I2S_SD 25
#define I2S_SCK 27
#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 22050
#define I2S_BUFFER_SIZE 1024

// ============== GLOBAL VARIABLES ==============
WiFiClient espClient;
PubSubClient client(espClient);
unsigned long lastReconnectAttempt = 0;
bool isStreaming = false;
unsigned long sessionStartTime = 0;
int ecgBuffer[ECG_BUFFER_SIZE];
int ecgBufferIndex = 0;
int16_t i2sBuffer[I2S_BUFFER_SIZE];

// ============== WIFI SETUP ==============
void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

// ============== MQTT CALLBACK ==============
void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);
}

// ============== MQTT RECONNECT ==============
boolean reconnect() {
  String clientId = "ESP32-" + String(device_id);
  
  if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
    Serial.println("MQTT connected");
    
    // Subscribe to control topics
    String controlTopic = "org/" + String(org_id) + "/device/" + String(device_id) + "/control";
    client.subscribe(controlTopic.c_str());
    
    // Send device online notification
    String onlineTopic = "org/" + String(org_id) + "/device/" + String(device_id) + "/status";
    StaticJsonDocument<256> doc;
    doc["status"] = "online";
    doc["ip"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    
    char buffer[256];
    serializeJson(doc, buffer);
    client.publish(onlineTopic.c_str(), buffer, true);
    
    digitalWrite(LED_PIN, HIGH);
  }
  
  return client.connected();
}

// ============== UUID GENERATOR ==============
void generateUUID(char* uuid) {
  const char hex[] = "0123456789abcdef";
  for (int i = 0; i < 36; i++) {
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      uuid[i] = '-';
    } else if (i == 14) {
      uuid[i] = '4';
    } else if (i == 19) {
      uuid[i] = hex[random(4, 8)];
    } else {
      uuid[i] = hex[random(0, 16)];
    }
  }
  uuid[36] = '\0';
}

// ============== I2S SETUP FOR AUDIO ==============
void setupI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = I2S_BUFFER_SIZE,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
}

// ============== SEND START PCG ==============
void sendStartPCG() {
  String topic = "org/" + String(org_id) + "/device/" + String(device_id) + "/session/" + String(session_id) + "/meta";
  
  StaticJsonDocument<512> doc;
  doc["type"] = "start_pcg";
  doc["session_id"] = session_id;
  doc["valve_position"] = "AV";
  doc["sample_rate_hz"] = PCG_SAMPLE_RATE;
  doc["format"] = "pcm_s16le";
  doc["channels"] = 1;
  doc["chunk_ms"] = 46;  // 1024 samples at 22050 Hz
  doc["target_duration_sec"] = 10;
  doc["timestamp_ms"] = millis();
  
  char buffer[512];
  serializeJson(doc, buffer);
  client.publish(topic.c_str(), buffer, true);
  
  Serial.println("Sent start_pcg message");
}

// ============== SEND START ECG ==============
void sendStartECG() {
  String topic = "org/" + String(org_id) + "/device/" + String(device_id) + "/session/" + String(session_id) + "/meta";
  
  StaticJsonDocument<512> doc;
  doc["type"] = "start_ecg";
  doc["session_id"] = session_id;
  doc["sample_rate_hz"] = ECG_SAMPLE_RATE;
  doc["format"] = "int16";
  doc["lead"] = "MLII";
  doc["chunk_samples"] = ECG_BUFFER_SIZE;
  doc["window_size"] = ECG_BUFFER_SIZE;
  doc["timestamp_ms"] = millis();
  
  char buffer[512];
  serializeJson(doc, buffer);
  client.publish(topic.c_str(), buffer, true);
  
  Serial.println("Sent start_ecg message");
}

// ============== SEND END MESSAGES ==============
void sendEndPCG() {
  String topic = "org/" + String(org_id) + "/device/" + String(device_id) + "/session/" + String(session_id) + "/meta";
  
  StaticJsonDocument<256> doc;
  doc["type"] = "end_pcg";
  doc["session_id"] = session_id;
  doc["timestamp_ms"] = millis();
  
  char buffer[256];
  serializeJson(doc, buffer);
  client.publish(topic.c_str(), buffer, true);
  
  Serial.println("Sent end_pcg message");
}

void sendEndECG() {
  String topic = "org/" + String(org_id) + "/device/" + String(device_id) + "/session/" + String(session_id) + "/meta";
  
  StaticJsonDocument<256> doc;
  doc["type"] = "end_ecg";
  doc["session_id"] = session_id;
  doc["timestamp_ms"] = millis();
  
  char buffer[256];
  serializeJson(doc, buffer);
  client.publish(topic.c_str(), buffer, true);
  
  Serial.println("Sent end_ecg message");
}

// ============== STREAM PCG DATA ==============
void streamPCGData() {
  String topic = "org/" + String(org_id) + "/device/" + String(device_id) + "/session/" + String(session_id) + "/pcg";
  
  size_t bytesRead;
  i2s_read(I2S_PORT, i2sBuffer, sizeof(i2sBuffer), &bytesRead, portMAX_DELAY);
  
  // Send binary data
  if (bytesRead > 0) {
    client.publish(topic.c_str(), (byte*)i2sBuffer, bytesRead, false);
  }
}

// ============== STREAM ECG DATA ==============
void streamECGData() {
  // Read ECG sample
  int ecgSample = analogRead(ECG_PIN);
  
  // Store in buffer
  ecgBuffer[ecgBufferIndex] = ecgSample;
  ecgBufferIndex++;
  
  // Send when buffer is full
  if (ecgBufferIndex >= ECG_BUFFER_SIZE) {
    String topic = "org/" + String(org_id) + "/device/" + String(device_id) + "/session/" + String(session_id) + "/ecg";
    
    // Convert to int16 bytes
    int16_t ecgInt16[ECG_BUFFER_SIZE];
    for (int i = 0; i < ECG_BUFFER_SIZE; i++) {
      ecgInt16[i] = (int16_t)ecgBuffer[i];
    }
    
    client.publish(topic.c_str(), (byte*)ecgInt16, sizeof(ecgInt16), false);
    
    ecgBufferIndex = 0;
  }
}

// ============== HEARTBEAT ==============
void sendHeartbeat() {
  String topic = "org/" + String(org_id) + "/device/" + String(device_id) + "/session/" + String(session_id) + "/heartbeat";
  
  StaticJsonDocument<256> doc;
  doc["timestamp_ms"] = millis();
  doc["device_id"] = device_id;
  doc["rssi"] = WiFi.RSSI();
  doc["uptime_sec"] = millis() / 1000;
  
  char buffer[256];
  serializeJson(doc, buffer);
  client.publish(topic.c_str(), buffer, false);
}

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n");
  Serial.println("==================================");
  Serial.println("AscultiCor ESP32 Starting...");
  Serial.println("==================================");
  
  // Setup pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(ECG_PIN, INPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Setup I2S for audio
  setupI2S();
  
  // Connect to WiFi
  setupWiFi();
  
  // Setup MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  client.setBufferSize(4096);  // Increase buffer for binary data
  
  // Generate session ID
  generateUUID(session_id);
  Serial.print("Session ID: ");
  Serial.println(session_id);
  
  Serial.println("Setup complete. Waiting for MQTT connection...");
}

// ============== MAIN LOOP ==============
unsigned long lastHeartbeat = 0;
unsigned long lastECGSample = 0;
unsigned long lastPCGSample = 0;
unsigned long streamingStart = 0;

void loop() {
  // MQTT Connection Management
  if (!client.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      Serial.println("Attempting MQTT connection...");
      if (reconnect()) {
        lastReconnectAttempt = 0;
      }
    }
  } else {
    client.loop();
  }
  
  // Start streaming when connected
  if (client.connected() && !isStreaming) {
    Serial.println("Starting data streaming...");
    
    // Send start messages
    sendStartPCG();
    delay(500);
    sendStartECG();
    
    isStreaming = true;
    streamingStart = millis();
    sessionStartTime = millis();
    
    Serial.println("Streaming started!");
    Serial.println("Duration: 10 seconds");
  }
  
  // Stream data
  if (isStreaming) {
    unsigned long now = millis();
    
    // Stream PCG at ~22kHz
    if (now - lastPCGSample >= 46) {  // Every 46ms for ~1024 samples
      streamPCGData();
      lastPCGSample = now;
    }
    
    // Stream ECG at 500Hz
    if (now - lastECGSample >= 2) {  // Every 2ms for 500Hz
      streamECGData();
      lastECGSample = now;
    }
    
    // Send heartbeat every 5 seconds
    if (now - lastHeartbeat >= 5000) {
      sendHeartbeat();
      lastHeartbeat = now;
    }
    
    // Check if 10 seconds passed
    if (now - streamingStart >= 10000) {
      Serial.println("Stopping streaming...");
      
      sendEndPCG();
      delay(500);
      sendEndECG();
      
      isStreaming = false;
      
      Serial.println("Streaming complete!");
      Serial.println("Results will appear in the web interface.");
      
      // Wait 30 seconds before starting next session
      delay(30000);
      
      // Generate new session ID
      generateUUID(session_id);
      Serial.print("New Session ID: ");
      Serial.println(session_id);
    }
  }
}
```

## Step 3: Deploy Trained ML Models

### Model File Locations

Place your trained models in the `inference/models/` directory:

```
inference/models/
├── pcg_classifier.pkl          # XGBoost model for PCG
├── murmur_severity.h5          # Keras model for severity analysis
├── ecg_predictor.h5            # Keras model for ECG
└── README.md
```

### Model Requirements

#### 1. PCG Classifier (pcg_classifier.pkl)

```python
# Expected input shape: (batch_size, 34)
# 34 features: 13 MFCC means + 13 MFCC stds + 6 spectral features + 2 ZCR features
# Expected output: probabilities for ['Normal', 'Murmur', 'Artifact']

# Training example:
import xgboost as xgb
from sklearn.model_selection import train_test_split

# X shape: (n_samples, 34)
# y shape: (n_samples,) with values 0, 1, 2

model = xgb.XGBClassifier(
    n_estimators=100,
    max_depth=6,
    learning_rate=0.1,
    objective='multi:softprob',
    num_class=3
)
model.fit(X_train, y_train)

# Save model
import pickle
with open('inference/models/pcg_classifier.pkl', 'wb') as f:
    pickle.dump(model, f)
```

#### 2. Murmur Severity Model (murmur_severity.h5)

```python
# Multi-head CNN model
import tensorflow as tf
from tensorflow import keras

# Input shape: (batch, time_steps, freq_bins, 1)
# For 10s audio at 22050Hz with hop_length=512:
# time_steps = 22050 * 10 / 512 = 431
# freq_bins = 128 (mel bins)

def create_severity_model():
    inputs = keras.Input(shape=(431, 128, 1))
    
    # Shared layers
    x = keras.layers.Conv2D(32, 3, activation='relu')(inputs)
    x = keras.layers.MaxPooling2D(2)(x)
    x = keras.layers.Conv2D(64, 3, activation='relu')(x)
    x = keras.layers.MaxPooling2D(2)(x)
    x = keras.layers.Conv2D(128, 3, activation='relu')(x)
    x = keras.layers.GlobalAveragePooling2D()(x)
    
    # Head 1: Location (AV, MV, PV, TV) - 4 classes
    location = keras.layers.Dense(4, activation='softmax', name='location')(x)
    
    # Head 2: Timing (systolic, diastolic, continuous) - 3 classes
    timing = keras.layers.Dense(3, activation='softmax', name='timing')(x)
    
    # Head 3: Shape (crescendo, decrescendo, plateau, crescendo-decrescendo) - 4 classes
    shape = keras.layers.Dense(4, activation='softmax', name='shape')(x)
    
    # Head 4: Grading (I/VI to VI/VI) - 6 classes
    grading = keras.layers.Dense(6, activation='softmax', name='grading')(x)
    
    # Head 5: Pitch (low, medium, high) - 3 classes
    pitch = keras.layers.Dense(3, activation='softmax', name='pitch')(x)
    
    # Head 6: Quality (blowing, harsh, rumbling, musical) - 4 classes
    quality = keras.layers.Dense(4, activation='softmax', name='quality')(x)
    
    model = keras.Model(inputs=inputs, outputs=[location, timing, shape, grading, pitch, quality])
    
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model

# Train and save
model = create_severity_model()
# model.fit(...)
model.save('inference/models/murmur_severity.h5')
```

#### 3. ECG Predictor (ecg_predictor.h5)

```python
# BiLSTM model for ECG classification
import tensorflow as tf
from tensorflow import keras

# Input shape: (batch, 500, 1) for 1 second at 500Hz
def create_ecg_model():
    inputs = keras.Input(shape=(500, 1))
    
    # Bidirectional LSTM
    x = keras.layers.Bidirectional(
        keras.layers.LSTM(64, return_sequences=True)
    )(inputs)
    x = keras.layers.Bidirectional(
        keras.layers.LSTM(32)
    )(x)
    
    # Dense layers
    x = keras.layers.Dense(64, activation='relu')(x)
    x = keras.layers.Dropout(0.5)(x)
    x = keras.layers.Dense(32, activation='relu')(x)
    
    # Output: Normal vs Abnormal
    outputs = keras.layers.Dense(2, activation='softmax', name='prediction')(x)
    
    model = keras.Model(inputs=inputs, outputs=outputs)
    
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model

# Train and save
model = create_ecg_model()
# model.fit(...)
model.save('inference/models/ecg_predictor.h5')
```

## Step 4: Configuration Updates

### 1. Update docker-compose.yml

```yaml
# Disable demo mode when using real models
inference:
  environment:
    - ENABLE_DEMO_MODE=false  # Set to false for production
```

### 2. Update .env

```env
# Production settings
ENABLE_DEMO_MODE=false
LOG_LEVEL=INFO

# AWS IoT Core (optional - for production)
# MQTT_BROKER=your-iot-endpoint.amazonaws.com
# MQTT_PORT=8883
# MQTT_USE_TLS=true
```

### 3. ESP32 Configuration

Update the ESP32 firmware with your actual values:

```cpp
// WiFi credentials
const char* ssid = "YourActualWiFi";
const char* password = "YourWiFiPassword";

// MQTT Broker
// For local Docker:
const char* mqtt_server = "192.168.1.100";  // Your computer's IP

// For production (AWS IoT Core):
// const char* mqtt_server = "your-endpoint.amazonaws.com";
// const int mqtt_port = 8883;

// Device credentials from Supabase
const char* org_id = "00000000-0000-0000-0000-000000000001";
const char* device_id = "00000000-0000-0000-0000-000000000004";
```

## Step 5: Production Deployment

### Option A: Local Network (Development)

1. Get your computer's IP address
2. Update ESP32 firmware with that IP
3. Ensure ESP32 and computer are on same WiFi
4. Start Docker services
5. Power on ESP32

### Option B: AWS IoT Core (Production)

1. Create AWS IoT Core endpoint
2. Generate device certificates
3. Update ESP32 firmware with certificates
4. Deploy inference service to AWS ECS
5. Configure security groups

See `docs/AWS_MIGRATION.md` for detailed steps.

## Step 6: Testing

### 1. Verify Hardware

```cpp
// Add this to setup() for testing sensors
void testSensors() {
  Serial.println("Testing ECG sensor...");
  for (int i = 0; i < 10; i++) {
    Serial.print("ECG Value: ");
    Serial.println(analogRead(ECG_PIN));
    delay(100);
  }
  
  Serial.println("Testing audio...");
  // Check I2S is reading data
  size_t bytesRead;
  i2s_read(I2S_PORT, i2sBuffer, sizeof(i2sBuffer), &bytesRead, portMAX_DELAY);
  Serial.print("Audio bytes read: ");
  Serial.println(bytesRead);
}
```

### 2. Monitor Data Flow

```bash
# Watch MQTT messages
mosquitto_sub -h localhost -p 1883 -t "org/#" -v

# Watch inference service logs
docker-compose logs -f inference

# Check database
# Go to Supabase dashboard and query predictions table
```

### 3. Validate Results

1. Place ECG electrodes on patient
2. Position microphone on chest
3. Power on ESP32
4. Watch web interface for real-time updates
5. Verify predictions match expected outputs

## Troubleshooting

### ESP32 Won't Connect to WiFi
- Check credentials
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Try WiFiManager library for configuration

### MQTT Connection Failed
- Verify broker IP is correct
- Check firewall settings
- Ensure Mosquitto is running: `docker-compose ps`

### No Data Received
- Check sensor wiring
- Verify I2S configuration for microphone
- Monitor serial output for errors

### Poor Quality Predictions
- Calibrate sensors
- Check signal preprocessing
- Verify model was trained on similar data
- Adjust sample rates if needed

## Performance Optimization

### ESP32 Optimizations
```cpp
// Use DMA for faster ADC
analogReadResolution(12);  // 12-bit ADC
analogSetAttenuation(ADC_11db);  // Full range

// Use dual-core
void setup() {
  // Audio sampling on Core 0
  xTaskCreatePinnedToCore(audioTask, "Audio", 10000, NULL, 1, NULL, 0);
  
  // MQTT on Core 1
  // Main loop runs on Core 1 by default
}
```

### Network Optimizations
- Use QoS 0 for real-time data (faster, no guarantee)
- Compress data if bandwidth is limited
- Batch small chunks if needed

## Security Considerations

1. **Use TLS/SSL** for MQTT in production
2. **Rotate device credentials** regularly
3. **Validate sensor data** on backend
4. **Encrypt stored recordings**
5. **Audit all access** via audit_logs table

## Next Steps

1. ✅ Flash ESP32 with firmware
2. ✅ Deploy trained models
3. ✅ Connect sensors to patient
4. ✅ Power on and monitor
5. ✅ View results in web interface
6. ✅ Collect data for continuous improvement

Your AscultiCor system is now ready for real-time patient monitoring! 🏥💓
