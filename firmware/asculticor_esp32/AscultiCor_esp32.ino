/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║               SONOCARDIA — ESP32 Firmware                    ║
 * ║       Real-Time Cardiac Monitoring (ECG + PCG)               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 🔒 SECURITY NOTE: Default credentials in this file are for 
 *    DEVELOPMENT ONLY. Change WiFi and MQTT passwords before
 *    production deployment. Use Serial provisioning to set 
 *    device-specific credentials securely.
 *
 * Architecture:
 *   Hardware Timer 0 → ECG sampling  (AD8232, 500 Hz via ADC)
 *   Hardware Timer 1 → PCG sampling  (MAX9814, 22050 Hz via ADC)
 *   Main loop       → MQTT publish, WiFi, session lifecycle
 *
 * Sensors:
 *   - ECG: AD8232 analog output → GPIO 32 (ADC1_CH4, 500 Hz)
 *   - PCG: MAX9814 microphone   → GPIO 33 (ADC1_CH5, 22050 Hz)
 *
 * Required Libraries (Arduino Library Manager):
 *   - PubSubClient  (Nick O'Leary)
 *   - ArduinoJson   (Benoit Blanchon, v6+)
 *
 * Board: ESP32-WROOM-32  |  Arduino IDE 2.x  |  ESP32 Core >= 2.0
 *
 * License: Graduation Project — All rights reserved.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>   // NVS flash storage for credentials

// ═══════════════════════════════════════════════════════════════
//  CONFIGURATION — Edit these or provision via Serial/NVS
// ═══════════════════════════════════════════════════════════════

// WiFi (fallback — can be overridden via NVS)
// ⚠️  SECURITY WARNING: Replace with your actual WiFi credentials.
//    Never commit real credentials to version control!
#define DEFAULT_WIFI_SSID       "YOUR_WIFI_SSID"
#define DEFAULT_WIFI_PASS       "YOUR_WIFI_PASSWORD"

// MQTT Broker
// ⚠️  SECURITY WARNING: Change these defaults before production deployment!
//    Use serial provisioning (HELP command) or NVS to set secure credentials.
#define DEFAULT_MQTT_HOST       "192.168.1.100"   // Docker host IP
#define DEFAULT_MQTT_PORT       1883
#define DEFAULT_MQTT_USER       "asculticor"
#define DEFAULT_MQTT_PASS       "CHANGE_ME_IN_PRODUCTION"
#define DEFAULT_BOOTSTRAP_URL   ""

// Default device identity (overridden after web registration)
#define DEFAULT_ORG_ID          "00000000-0000-0000-0000-000000000001"
#define DEFAULT_DEVICE_ID       "00000000-0000-0000-0000-000000000004"

// ═══════════════════════════════════════════════════════════════
//  SAMPLING CONSTANTS
// ═══════════════════════════════════════════════════════════════
#define ECG_SAMPLE_RATE         500       // Hz
#define PCG_SAMPLE_RATE         22050     // Hz
#define ECG_BUFFER_SIZE         500       // 1 s of ECG samples
#define PCG_CHUNK_SAMPLES       512       // Samples per MQTT chunk
#define SESSION_DURATION_SEC    10        // Recording window
#define INTER_SESSION_SEC       30        // Pause between sessions
#define HEARTBEAT_INTERVAL_MS   5000
#define MQTT_BUFFER_BYTES       4096
#define WIFI_RETRY_MS           10000
#define MQTT_RETRY_MS           5000

// ═══════════════════════════════════════════════════════════════
//  HARDWARE PINS
// ═══════════════════════════════════════════════════════════════
#define ECG_PIN       32    // AD8232 analog output (ADC1_CH4)
#define ECG_LO_PLUS   34    // AD8232 leads-off detection +
#define ECG_LO_MINUS  35    // AD8232 leads-off detection -

#define MIC_PIN       33    // MAX9814 analog output (ADC1_CH5)
                            // MAX9814 Gain → connect to GND (60dB)
                            // MAX9814 A/R  → leave floating (default attack/release)

#define LED_PIN       2     // On-board LED (status indicator)

// ═══════════════════════════════════════════════════════════════
//  LED STATUS PATTERNS
// ═══════════════════════════════════════════════════════════════
enum LedPattern {
  LED_OFF,              // System idle / error
  LED_CONNECTING,       // Slow blink — WiFi or MQTT connecting
  LED_CONNECTED,        // Solid on
  LED_STREAMING,        // Fast blink — actively streaming
  LED_ERROR             // Triple-flash pattern
};

// ═══════════════════════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════════════════════
WiFiClient         espClient;
PubSubClient       mqtt(espClient);
Preferences        nvs;

// Credentials (loaded from NVS or defaults)
char wifi_ssid[64];
char wifi_pass[64];
char mqtt_host[128];
int  mqtt_port;
char mqtt_user[64];
char mqtt_pass[64];
char bootstrap_url[192];
char org_id[40];
char device_id[40];
char device_secret[80];  // Used by bootstrap provisioning and future per-device auth
char session_id[37];

// State
volatile bool     isStreaming       = false;
volatile bool     ecgSampleReady   = false;   // Set by ECG timer ISR
volatile bool     pcgSampleReady   = false;   // Set by PCG timer ISR
bool              leadsOff         = false;
unsigned long     streamStartMs    = 0;
unsigned long     lastHeartbeatMs  = 0;
unsigned long     lastReconnectMs  = 0;
unsigned long     lastWifiCheckMs  = 0;
unsigned long     lastLedToggleMs  = 0;
bool              ledState         = false;
LedPattern        currentLedPattern = LED_OFF;

// ECG Buffers
int16_t           ecgBuffer[ECG_BUFFER_SIZE];
int               ecgBufferIdx     = 0;

// PCG Double-Buffering
//   While one buffer is being sent via MQTT, the ISR fills the other.
#define PCG_NUM_BUFFERS  2
int16_t           pcgBuffers[PCG_NUM_BUFFERS][PCG_CHUNK_SAMPLES];
volatile int      pcgWriteBufIdx   = 0;        // Which buffer the ISR writes into
volatile int      pcgSampleIdx     = 0;        // Current sample index within write buffer
volatile bool     pcgBufferReady   = false;     // A buffer is full and ready to send
volatile int      pcgReadBufIdx    = -1;        // Which buffer to read/send (-1 = none)

// Hardware timers
hw_timer_t       *ecgTimer         = NULL;
hw_timer_t       *pcgTimer         = NULL;

// ═══════════════════════════════════════════════════════════════
//  TOPIC BUILDER
// ═══════════════════════════════════════════════════════════════
// Avoids repetitive String concatenation inside loop().
// Base: org/<org_id>/device/<device_id>
char topicBase[120];

void buildTopicBase() {
  snprintf(topicBase, sizeof(topicBase),
           "org/%s/device/%s", org_id, device_id);
}

void buildTopic(char *out, size_t len, const char *suffix) {
  snprintf(out, len, "%s/%s", topicBase, suffix);
}

void buildSessionTopic(char *out, size_t len, const char *suffix) {
  snprintf(out, len, "%s/session/%s/%s", topicBase, session_id, suffix);
}

// ═══════════════════════════════════════════════════════════════
//  NVS CREDENTIAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════
// Credentials persist across re-flashes. Use Serial commands or
// the web UI "provision" flow to set them once.

void loadCredentials() {
  nvs.begin("asculticor", true);  // read-only

  strlcpy(wifi_ssid,     nvs.getString("wifi_ssid",     DEFAULT_WIFI_SSID).c_str(),   sizeof(wifi_ssid));
  strlcpy(wifi_pass,     nvs.getString("wifi_pass",     DEFAULT_WIFI_PASS).c_str(),   sizeof(wifi_pass));
  strlcpy(mqtt_host,     nvs.getString("mqtt_host",     DEFAULT_MQTT_HOST).c_str(),   sizeof(mqtt_host));
  mqtt_port = nvs.getInt("mqtt_port", DEFAULT_MQTT_PORT);
  strlcpy(mqtt_user,     nvs.getString("mqtt_user",     DEFAULT_MQTT_USER).c_str(),   sizeof(mqtt_user));
  strlcpy(mqtt_pass,     nvs.getString("mqtt_pass",     DEFAULT_MQTT_PASS).c_str(),   sizeof(mqtt_pass));
  strlcpy(bootstrap_url, nvs.getString("bootstrap_url", DEFAULT_BOOTSTRAP_URL).c_str(), sizeof(bootstrap_url));
  strlcpy(org_id,        nvs.getString("org_id",        DEFAULT_ORG_ID).c_str(),      sizeof(org_id));
  strlcpy(device_id,     nvs.getString("device_id",     DEFAULT_DEVICE_ID).c_str(),   sizeof(device_id));
  strlcpy(device_secret, nvs.getString("device_secret", "").c_str(),                  sizeof(device_secret));

  nvs.end();

  Serial.println("[NVS] Credentials loaded:");
  Serial.printf("  WiFi SSID     : %s\n", wifi_ssid);
  Serial.printf("  MQTT Host     : %s:%d\n", mqtt_host, mqtt_port);
  Serial.printf("  Bootstrap URL : %s\n", strlen(bootstrap_url) > 0 ? bootstrap_url : "(not set)");
  Serial.printf("  Device ID     : %s\n", device_id);
  Serial.printf("  Device Secret : %s\n", strlen(device_secret) > 0 ? "***set***" : "(not set)");
  Serial.printf("  Org ID        : %s\n", org_id);
}

void saveCredential(const char *key, const char *value) {
  nvs.begin("asculticor", false);  // read-write

  if (strcmp(key, "mqtt_port") == 0) {
    nvs.putInt(key, atoi(value));
  } else {
    nvs.putString(key, value);
  }

  nvs.end();
  Serial.printf("[NVS] Saved %s = %s\n", key, value);
}

bool shouldUseBootstrap() {
  return strlen(device_secret) > 0 && strlen(bootstrap_url) > 0;
}

bool fetchBootstrapConfig() {
  if (!shouldUseBootstrap() || WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  StaticJsonDocument<256> requestDoc;
  requestDoc["device_id"] = device_id;
  requestDoc["device_secret"] = device_secret;

  String requestBody;
  serializeJson(requestDoc, requestBody);

  bool isHttps = strncmp(bootstrap_url, "https://", 8) == 0;
  int httpCode = -1;
  String responseBody;

  if (isHttps) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure();  // Replace with CA validation in production.
    if (!http.begin(secureClient, bootstrap_url)) {
      Serial.println("[BOOTSTRAP] Failed to initialize HTTPS client");
      return false;
    }
  } else {
    WiFiClient client;
    if (!http.begin(client, bootstrap_url)) {
      Serial.println("[BOOTSTRAP] Failed to initialize HTTP client");
      return false;
    }
  }

  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  Serial.printf("[BOOTSTRAP] Requesting broker config from %s\n", bootstrap_url);
  httpCode = http.POST(requestBody);
  if (httpCode <= 0) {
    Serial.printf("[BOOTSTRAP] Request failed, code=%d\n", httpCode);
    http.end();
    return false;
  }

  responseBody = http.getString();
  http.end();

  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("[BOOTSTRAP] Server returned HTTP %d: %s\n", httpCode, responseBody.c_str());
    return false;
  }

  StaticJsonDocument<512> responseDoc;
  DeserializationError err = deserializeJson(responseDoc, responseBody);
  if (err) {
    Serial.printf("[BOOTSTRAP] Invalid JSON response: %s\n", err.c_str());
    return false;
  }

  const char *newMqttHost = responseDoc["mqtt_host"];
  const char *newMqttUser = responseDoc["mqtt_user"];
  const char *newMqttPass = responseDoc["mqtt_pass"];
  const char *newOrgId    = responseDoc["org_id"];
  int newMqttPort         = responseDoc["mqtt_port"] | DEFAULT_MQTT_PORT;

  if (!newMqttHost || !newMqttUser || !newMqttPass || !newOrgId) {
    Serial.println("[BOOTSTRAP] Response missing required broker fields");
    return false;
  }

  strlcpy(mqtt_host, newMqttHost, sizeof(mqtt_host));
  strlcpy(mqtt_user, newMqttUser, sizeof(mqtt_user));
  strlcpy(mqtt_pass, newMqttPass, sizeof(mqtt_pass));
  strlcpy(org_id, newOrgId, sizeof(org_id));
  mqtt_port = newMqttPort;

  buildTopicBase();
  mqtt.setServer(mqtt_host, mqtt_port);

  Serial.printf("[BOOTSTRAP] Loaded broker config: %s:%d\n", mqtt_host, mqtt_port);
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  SERIAL PROVISIONING
// ═══════════════════════════════════════════════════════════════
// Send commands via Serial Monitor to configure credentials:
//   SET wifi_ssid MyNetwork
//   SET wifi_pass MyPassword123
//   SET mqtt_host 192.168.1.50
//   SET device_id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
//   REBOOT

void handleSerialProvisioning() {
  if (!Serial.available()) return;

  String line = Serial.readStringUntil('\n');
  line.trim();

  if (line.startsWith("SET ")) {
    int spaceIdx = line.indexOf(' ', 4);
    if (spaceIdx > 0) {
      String key   = line.substring(4, spaceIdx);
      String value = line.substring(spaceIdx + 1);
      saveCredential(key.c_str(), value.c_str());
      Serial.printf("[PROV] Set '%s' = '%s'. REBOOT to apply.\n", key.c_str(), value.c_str());
    }
  } else if (line == "REBOOT") {
    Serial.println("[PROV] Rebooting...");
    delay(500);
    ESP.restart();
  } else if (line == "STATUS") {
    Serial.printf("[STATUS] WiFi: %s | MQTT: %s | Streaming: %s\n",
      WiFi.isConnected() ? "OK" : "DISCONNECTED",
      mqtt.connected() ? "OK" : "DISCONNECTED",
      isStreaming ? "YES" : "NO");
    Serial.printf("[STATUS] Free heap: %d bytes\n", ESP.getFreeHeap());
    Serial.printf("[STATUS] Bootstrap: %s\n",
      shouldUseBootstrap() ? bootstrap_url : "(disabled)");
  } else if (line == "HELP") {
    Serial.println("Commands: SET <key> <value> | REBOOT | STATUS | HELP");
    Serial.println("Keys: wifi_ssid, wifi_pass, mqtt_host, mqtt_port, mqtt_user, mqtt_pass, bootstrap_url, org_id, device_id, device_secret");
    Serial.println("\nRecommended bootstrap setup (from web app 'Add Device' modal):");
    Serial.println("  SET device_id     <id from web>");
    Serial.println("  SET device_secret <secret from web>");
    Serial.println("  SET bootstrap_url <http://server/api/device/bootstrap>");
    Serial.println("  SET wifi_ssid     <your WiFi name>");
    Serial.println("  SET wifi_pass     <your WiFi password>");
    Serial.println("  REBOOT");
    Serial.println("\nLegacy manual MQTT setup:");
    Serial.println("  SET org_id       <org from web>");
    Serial.println("  SET mqtt_host    <broker host>");
    Serial.println("  SET mqtt_port    1883");
    Serial.println("  SET mqtt_user    <broker user>");
    Serial.println("  SET mqtt_pass    <broker password>");
  }
}

// ═══════════════════════════════════════════════════════════════
//  UUID v4 GENERATOR
// ═══════════════════════════════════════════════════════════════
void generateUUID(char *uuid) {
  const char hex[] = "0123456789abcdef";
  for (int i = 0; i < 36; i++) {
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      uuid[i] = '-';
    } else if (i == 14) {
      uuid[i] = '4';           // version 4
    } else if (i == 19) {
      uuid[i] = hex[random(8, 12)]; // variant 1 (8, 9, a, b)
    } else {
      uuid[i] = hex[random(0, 16)];
    }
  }
  uuid[36] = '\0';
}

// ═══════════════════════════════════════════════════════════════
//  LED CONTROL
// ═══════════════════════════════════════════════════════════════
void setLedPattern(LedPattern pattern) {
  currentLedPattern = pattern;
}

void updateLed() {
  unsigned long now = millis();
  switch (currentLedPattern) {
    case LED_OFF:
      digitalWrite(LED_PIN, LOW);
      break;
    case LED_CONNECTING:
      if (now - lastLedToggleMs >= 500) {  // 1 Hz slow blink
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState);
        lastLedToggleMs = now;
      }
      break;
    case LED_CONNECTED:
      digitalWrite(LED_PIN, HIGH);
      break;
    case LED_STREAMING:
      if (now - lastLedToggleMs >= 100) {  // 5 Hz fast blink
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState);
        lastLedToggleMs = now;
      }
      break;
    case LED_ERROR:
      // Triple flash every 2 seconds
      {
        unsigned long phase = (now / 150) % 10;
        digitalWrite(LED_PIN, (phase < 6 && phase % 2 == 0) ? HIGH : LOW);
      }
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
//  WiFi
// ═══════════════════════════════════════════════════════════════
void setupWiFi() {
  Serial.printf("[WiFi] Connecting to %s", wifi_ssid);
  setLedPattern(LED_CONNECTING);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);   // ESP-IDF level auto-reconnect
  WiFi.begin(wifi_ssid, wifi_pass);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {  // 20s timeout
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected! IP: %s  RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] FAILED — will retry in loop()");
    setLedPattern(LED_ERROR);
  }
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  unsigned long now = millis();
  if (now - lastWifiCheckMs < WIFI_RETRY_MS) return false;
  lastWifiCheckMs = now;

  Serial.println("[WiFi] Connection lost — reconnecting...");
  setLedPattern(LED_CONNECTING);
  WiFi.disconnect();
  WiFi.begin(wifi_ssid, wifi_pass);

  // Brief blocking wait (2s max)
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 4) {
    delay(500);
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Reconnected! IP: %s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  ADC SETUP (shared by ECG AD8232 and PCG MAX9814)
// ═══════════════════════════════════════════════════════════════
void setupADC() {
  analogReadResolution(12);             // 12-bit (0–4095)
  analogSetAttenuation(ADC_11db);       // Full 0–3.3V range

  // ECG pins
  pinMode(ECG_PIN, INPUT);
  pinMode(ECG_LO_PLUS, INPUT);
  pinMode(ECG_LO_MINUS, INPUT);

  // MAX9814 microphone output (analog)
  pinMode(MIC_PIN, INPUT);

  Serial.println("[ADC] Configured: 12-bit, 11dB attenuation");
  Serial.printf("[ADC] ECG on GPIO%d, MIC on GPIO%d\n", ECG_PIN, MIC_PIN);
}

// Read ECG with leads-off detection and mV conversion
int16_t readEcgSample() {
  // Check leads-off detection pins
  leadsOff = (digitalRead(ECG_LO_PLUS) == HIGH || digitalRead(ECG_LO_MINUS) == HIGH);
  if (leadsOff) return 0;  // Return baseline when leads are off

  int raw = analogRead(ECG_PIN);
  // Convert to millivolts:  raw / 4095 * 3300 mV
  // Scaled to int16: center around 0 (subtract mid-range)
  int16_t mV = (int16_t)(((raw - 2048) * 3300L) / 4095);
  return mV;
}

// ═══════════════════════════════════════════════════════════════
//  HARDWARE TIMERS (ECG 500 Hz + PCG 22050 Hz)
// ═══════════════════════════════════════════════════════════════

// --- ECG Timer ISR (500 Hz) ---
void IRAM_ATTR onEcgTimerISR() {
  ecgSampleReady = true;
}

void setupEcgTimer() {
  ecgTimer = timerBegin(0, 80, true);                 // Timer 0, prescaler 80 → 1 µs tick
  timerAttachInterrupt(ecgTimer, &onEcgTimerISR, true);
  timerAlarmWrite(ecgTimer, 2000, true);               // 2000 µs = 500 Hz
  timerAlarmEnable(ecgTimer);
  Serial.println("[ECG] Hardware timer started: 500 Hz");
}

// --- PCG Timer ISR (22050 Hz) ---
//   Reads MAX9814 analog output directly in the ISR.
//   analogRead() takes ~10 µs on ESP32 — well within the 45 µs period.
void IRAM_ATTR onPcgTimerISR() {
  if (!isStreaming) return;

  // Read MAX9814 analog output (0-4095, 12-bit, biased at ~VCC/2)
  int raw = analogRead(MIC_PIN);

  // Center around zero (MAX9814 output is biased at ~VCC/2 ≈ 1.65V ≈ 2048)
  int16_t sample = (int16_t)(raw - 2048);

  // Store in current write buffer
  pcgBuffers[pcgWriteBufIdx][pcgSampleIdx] = sample;
  pcgSampleIdx++;

  // Buffer full → swap
  if (pcgSampleIdx >= PCG_CHUNK_SAMPLES) {
    pcgReadBufIdx  = pcgWriteBufIdx;      // Mark current as ready-to-send
    pcgWriteBufIdx = 1 - pcgWriteBufIdx;  // Swap to other buffer
    pcgSampleIdx   = 0;
    pcgBufferReady = true;
  }
}

void setupPcgTimer() {
  pcgTimer = timerBegin(1, 80, true);                 // Timer 1, prescaler 80 → 1 µs tick
  timerAttachInterrupt(pcgTimer, &onPcgTimerISR, true);
  timerAlarmWrite(pcgTimer, 45, true);                 // 45 µs ≈ 22222 Hz (closest to 22050)
  timerAlarmEnable(pcgTimer);
  Serial.printf("[PCG] Hardware timer started: ~%d Hz (MAX9814 on GPIO%d)\n",
                1000000 / 45, MIC_PIN);
}

// ═══════════════════════════════════════════════════════════════
//  MQTT
// ═══════════════════════════════════════════════════════════════
void mqttCallback(char *topic, byte *payload, unsigned int length) {
  // Parse incoming control messages
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;

  const char *command = doc["command"];
  if (!command) return;

  Serial.printf("[MQTT] Control command: %s\n", command);

  if (strcmp(command, "reboot") == 0) {
    Serial.println("[MQTT] Reboot requested!");
    delay(500);
    ESP.restart();
  } else if (strcmp(command, "stop") == 0 && isStreaming) {
    Serial.println("[MQTT] Stop requested — ending session early");
    isStreaming = false;
  }
}

bool mqttReconnect() {
  char clientId[48];
  snprintf(clientId, sizeof(clientId), "ESP32-%s", device_id);

  if (shouldUseBootstrap() && WiFi.status() == WL_CONNECTED) {
    fetchBootstrapConfig();
  }

  Serial.printf("[MQTT] Connecting as %s to %s:%d (auth: mqtt_user/mqtt_pass)...\n",
                clientId, mqtt_host, mqtt_port);

  if (mqtt.connect(clientId, mqtt_user, mqtt_pass)) {
    Serial.println("[MQTT] Connected!");

    // Subscribe to control topic
    char controlTopic[140];
    buildTopic(controlTopic, sizeof(controlTopic), "control");
    mqtt.subscribe(controlTopic);

    // Publish device online status (RETAINED — so dashboard sees current state)
    char statusTopic[140];
    buildTopic(statusTopic, sizeof(statusTopic), "status");

    StaticJsonDocument<256> doc;
    doc["status"]           = "online";
    doc["ip"]               = WiFi.localIP().toString();
    doc["rssi"]             = WiFi.RSSI();
    doc["firmware_version"] = "3.0.0";
    doc["free_heap"]        = ESP.getFreeHeap();
    doc["mic_type"]         = "MAX9814";

    char buf[256];
    serializeJson(doc, buf);
    mqtt.publish(statusTopic, buf, true);  // retained = true for status

    setLedPattern(LED_CONNECTED);
    return true;
  }

  Serial.printf("[MQTT] Failed, rc=%d\n", mqtt.state());
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  SESSION META MESSAGES
// ═══════════════════════════════════════════════════════════════
void publishSessionMeta(const char *type, const char *extraKey = nullptr,
                        const char *extraVal = nullptr, int extraInt = 0,
                        bool hasInt = false) {
  char topic[160];
  buildSessionTopic(topic, sizeof(topic), "meta");

  StaticJsonDocument<512> doc;
  doc["type"]         = type;
  doc["session_id"]   = session_id;
  doc["device_id"]    = device_id;
  doc["timestamp_ms"] = millis();

  // Add modality-specific fields
  if (strcmp(type, "start_pcg") == 0) {
    doc["valve_position"]     = "AV";
    doc["sample_rate_hz"]     = PCG_SAMPLE_RATE;
    doc["format"]             = "pcm_s16le";
    doc["channels"]           = 1;
    doc["chunk_samples"]      = PCG_CHUNK_SAMPLES;
    doc["target_duration_sec"] = SESSION_DURATION_SEC;
    doc["microphone"]         = "MAX9814";
    doc["gain_db"]            = 60;
  } else if (strcmp(type, "start_ecg") == 0) {
    doc["sample_rate_hz"]   = ECG_SAMPLE_RATE;
    doc["format"]           = "int16_mv";
    doc["lead"]             = "MLII";
    doc["chunk_samples"]    = ECG_BUFFER_SIZE;
    doc["adc_resolution"]   = 12;
    doc["target_duration_sec"] = SESSION_DURATION_SEC;
  }

  char buf[512];
  serializeJson(doc, buf);
  mqtt.publish(topic, buf, false);  // NOT retained for session data

  Serial.printf("[META] Sent: %s\n", type);
}

// ═══════════════════════════════════════════════════════════════
//  HEARTBEAT & TELEMETRY
// ═══════════════════════════════════════════════════════════════
void sendHeartbeat() {
  char topic[160];
  buildSessionTopic(topic, sizeof(topic), "heartbeat");

  StaticJsonDocument<256> doc;
  doc["timestamp_ms"]  = millis();
  doc["device_id"]     = device_id;
  doc["rssi"]          = WiFi.RSSI();
  doc["uptime_sec"]    = millis() / 1000;
  doc["free_heap"]     = ESP.getFreeHeap();
  doc["leads_off"]     = leadsOff;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(topic, buf, false);
}

// ═══════════════════════════════════════════════════════════════
//  PCG STREAMING (timer-driven, send from main loop)
// ═══════════════════════════════════════════════════════════════
void processPcgBuffer() {
  if (!pcgBufferReady || !isStreaming || !mqtt.connected()) return;

  char topic[160];
  buildSessionTopic(topic, sizeof(topic), "pcg");

  int bufToSend = pcgReadBufIdx;
  size_t payloadBytes = PCG_CHUNK_SAMPLES * sizeof(int16_t);

  if (payloadBytes <= MQTT_BUFFER_BYTES) {
    mqtt.publish(topic, (byte *)pcgBuffers[bufToSend], payloadBytes, false);
  } else {
    Serial.printf("[PCG] WARNING: chunk %d > MQTT buffer %d!\n",
                  payloadBytes, MQTT_BUFFER_BYTES);
  }

  pcgBufferReady = false;
}

// ═══════════════════════════════════════════════════════════════
//  ECG STREAMING (timer-driven, process from main loop)
// ═══════════════════════════════════════════════════════════════
void processEcgSample() {
  if (!ecgSampleReady) return;
  ecgSampleReady = false;

  if (!isStreaming) return;

  ecgBuffer[ecgBufferIdx++] = readEcgSample();

  // Send when buffer is full (every 1 second)
  if (ecgBufferIdx >= ECG_BUFFER_SIZE) {
    char topic[160];
    buildSessionTopic(topic, sizeof(topic), "ecg");

    size_t payloadBytes = ECG_BUFFER_SIZE * sizeof(int16_t);
    if (payloadBytes <= MQTT_BUFFER_BYTES) {
      mqtt.publish(topic, (byte *)ecgBuffer, payloadBytes, false);
    } else {
      Serial.println("[ECG] WARNING: buffer exceeds MQTT limit!");
    }

    ecgBufferIdx = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
//  SESSION LIFECYCLE
// ═══════════════════════════════════════════════════════════════
void startSession() {
  generateUUID(session_id);
  Serial.printf("\n[SESSION] ═══ Starting session: %s ═══\n", session_id);

  // Send start messages
  publishSessionMeta("start_pcg");
  delay(200);
  publishSessionMeta("start_ecg");

  // Reset buffers
  ecgBufferIdx   = 0;
  pcgSampleIdx   = 0;
  pcgWriteBufIdx = 0;
  pcgBufferReady = false;
  pcgReadBufIdx  = -1;
  streamStartMs  = millis();
  isStreaming     = true;
  setLedPattern(LED_STREAMING);

  Serial.printf("[SESSION] Recording for %d seconds...\n", SESSION_DURATION_SEC);
}

void endSession() {
  isStreaming = false;
  setLedPattern(LED_CONNECTED);

  delay(200);  // Let final buffers flush

  publishSessionMeta("end_pcg");
  delay(200);
  publishSessionMeta("end_ecg");

  Serial.printf("[SESSION] ═══ Session %s complete ═══\n", session_id);
  Serial.println("[SESSION] Results will appear in the web dashboard.");
}

// ═══════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║   SONOCARDIA ESP32 v3.0                  ║");
  Serial.println("║   Cardiac Monitoring Firmware             ║");
  Serial.println("║   Sensors: AD8232 (ECG) + MAX9814 (PCG)  ║");
  Serial.println("╚══════════════════════════════════════════╝");
  Serial.println();
  Serial.println("Type HELP for serial provisioning commands.");
  Serial.println();

  // Pin setup
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Load credentials from NVS (or defaults)
  loadCredentials();

  // Build MQTT topic prefix
  buildTopicBase();

  // ADC for ECG + PCG (both are analog)
  setupADC();

  // WiFi
  setupWiFi();

  if (shouldUseBootstrap() && WiFi.status() == WL_CONNECTED) {
    if (!fetchBootstrapConfig()) {
      Serial.println("[BOOTSTRAP] Falling back to locally stored MQTT credentials");
    }
  }

  // MQTT
  mqtt.setServer(mqtt_host, mqtt_port);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(MQTT_BUFFER_BYTES);

  // Hardware timer for precise ECG sampling (500 Hz)
  setupEcgTimer();

  // Hardware timer for precise PCG sampling (22050 Hz via MAX9814)
  setupPcgTimer();

  Serial.println();
  Serial.println("[SETUP] ✓ Complete. Entering main loop...");
  Serial.println();
}

// ═══════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── Serial provisioning ──
  handleSerialProvisioning();

  // ── LED feedback ──
  updateLed();

  // ── WiFi health check ──
  if (!ensureWiFi()) {
    delay(100);
    return;  // Skip everything until WiFi is back
  }

  // ── MQTT connection ──
  if (!mqtt.connected()) {
    setLedPattern(LED_CONNECTING);
    if (now - lastReconnectMs >= MQTT_RETRY_MS) {
      lastReconnectMs = now;
      mqttReconnect();
    }
    return;  // Don't stream without MQTT
  }
  mqtt.loop();

  // ── Process ECG samples (timer-driven, non-blocking) ──
  processEcgSample();

  // ── Send PCG buffer when ready (timer fills it, we send it here) ──
  processPcgBuffer();

  // ── Session auto-start when connected ──
  if (!isStreaming && mqtt.connected()) {
    startSession();
  }

  // ── Heartbeat ──
  if (isStreaming && now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeatMs = now;
  }

  // ── Session duration check ──
  if (isStreaming && now - streamStartMs >= (SESSION_DURATION_SEC * 1000UL)) {
    endSession();

    Serial.printf("[SESSION] Next session in %d seconds...\n", INTER_SESSION_SEC);
    delay(INTER_SESSION_SEC * 1000UL);
  }
}
