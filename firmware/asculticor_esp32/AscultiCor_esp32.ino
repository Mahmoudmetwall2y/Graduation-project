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
#include <strings.h>

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
#define DEFAULT_SESSION_DURATION_SEC 15   // Default recording window
#define MIN_SESSION_DURATION_SEC  8
#define MAX_SESSION_DURATION_SEC  60
#define INTER_SESSION_SEC       30        // Pause between sessions
#define HEARTBEAT_INTERVAL_MS   5000
#define DEVICE_STATUS_INTERVAL_MS 30000
#define MQTT_BUFFER_BYTES       4096
#define MQTT_KEEPALIVE_SEC      60
#define WIFI_RETRY_MS           10000
#define MQTT_RETRY_MS           5000
#define SERIAL_COMMAND_BUFFER   256
#define SERIAL_COMMAND_IDLE_MS  150
#define ECG_PREFLIGHT_SAMPLES   300
#define PCG_PREFLIGHT_SAMPLES   2048
#define ECG_MIN_P2P_MV          80
#define PCG_MIN_MEAN_ABS_COUNTS 12
#define PCG_MIN_P2P_COUNTS      80
#define PCG_MAX_PEAK_ABS_COUNTS 1900
#define PREFLIGHT_REASON_BYTES  160

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
void startSession(const char* new_session_id = nullptr, uint16_t requestedDurationSec = 0);
void processPcgBuffer();
void publishDeviceStatus();

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
char bootstrap_tls_fingerprint[96];
char bootstrap_ca_pem[1600];
char org_id[40];
char device_id[40];
char device_secret[80];  // Used by bootstrap provisioning and future per-device auth
char session_id[37];
bool bootstrap_insecure = false;
uint16_t defaultSessionDurationSec = DEFAULT_SESSION_DURATION_SEC;
uint16_t activeSessionDurationSec  = DEFAULT_SESSION_DURATION_SEC;

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
unsigned long     lastDeviceStatusMs = 0;
unsigned long     sessionCooldownUntilMs = 0;
bool              ledState         = false;
bool              stopSessionRequested = false;
LedPattern        currentLedPattern = LED_OFF;
char              serialInputBuffer[SERIAL_COMMAND_BUFFER];
size_t            serialInputLen   = 0;
unsigned long     lastSerialByteMs = 0;
uint32_t          lastReportedPcgDropCount = 0;

// ECG Buffers
int16_t           ecgBuffer[ECG_BUFFER_SIZE];
int               ecgBufferIdx     = 0;

struct SessionPreflightReport {
  bool passed;
  bool ecg_leads_connected;
  bool ecg_signal_present;
  bool pcg_signal_present;
  bool pcg_clipping_detected;
  int  ecg_peak_to_peak_mv;
  int  pcg_mean_abs_counts;
  int  pcg_peak_to_peak_counts;
  int  pcg_peak_abs_counts;
  char reason[PREFLIGHT_REASON_BYTES];
};

// PCG multi-buffer queueing.
//   Several completed chunks can wait for MQTT publish without being overwritten.
#define PCG_NUM_BUFFERS  4
enum PcgBufferState {
  PCG_BUF_FREE = 0,
  PCG_BUF_FILLING = 1,
  PCG_BUF_READY = 2,
  PCG_BUF_SENDING = 3
};
int16_t           pcgBuffers[PCG_NUM_BUFFERS][PCG_CHUNK_SAMPLES];
volatile int      pcgWriteBufIdx   = 0;        // Which buffer the ISR writes into
volatile int      pcgSampleIdx     = 0;        // Current sample index within write buffer
volatile uint8_t  pcgBufferStates[PCG_NUM_BUFFERS] = {0};
volatile int      pcgReadyQueue[PCG_NUM_BUFFERS];
volatile uint8_t  pcgReadyHead     = 0;
volatile uint8_t  pcgReadyTail     = 0;
volatile uint8_t  pcgReadyCount    = 0;
volatile uint32_t pcgDroppedBuffers = 0;

// Hardware timers
hw_timer_t       *ecgTimer         = NULL;
hw_timer_t       *pcgTimer         = NULL;

// ═══════════════════════════════════════════════════════════════
//  TOPIC BUILDER
// ═══════════════════════════════════════════════════════════════
// Avoids repetitive String concatenation inside loop().
// Base: org/<org_id>/device/<device_id>
char topicBase[120];

uint16_t sanitizeSessionDurationSec(int requested) {
  if (requested < MIN_SESSION_DURATION_SEC) return MIN_SESSION_DURATION_SEC;
  if (requested > MAX_SESSION_DURATION_SEC) return MAX_SESSION_DURATION_SEC;
  return (uint16_t)requested;
}

void appendSessionReason(char *buffer, size_t len, const char *reason) {
  if (!buffer || !reason || len == 0) return;

  size_t used = strlen(buffer);
  if (used >= len - 1) return;

  snprintf(
    buffer + used,
    len - used,
    "%s%s",
    used > 0 ? "; " : "",
    reason
  );
}

int IRAM_ATTR findNextFreePcgBuffer(int currentIdx) {
  for (int offset = 1; offset <= PCG_NUM_BUFFERS; offset++) {
    int candidate = (currentIdx + offset) % PCG_NUM_BUFFERS;
    if (pcgBufferStates[candidate] == PCG_BUF_FREE) {
      return candidate;
    }
  }
  return -1;
}

void resetPcgBufferQueue() {
  noInterrupts();
  pcgWriteBufIdx = 0;
  pcgSampleIdx = 0;
  pcgReadyHead = 0;
  pcgReadyTail = 0;
  pcgReadyCount = 0;
  pcgDroppedBuffers = 0;
  for (int i = 0; i < PCG_NUM_BUFFERS; i++) {
    pcgBufferStates[i] = PCG_BUF_FREE;
    pcgReadyQueue[i] = -1;
  }
  pcgBufferStates[pcgWriteBufIdx] = PCG_BUF_FILLING;
  interrupts();
  lastReportedPcgDropCount = 0;
}

bool hasQueuedPcgBuffers() {
  noInterrupts();
  bool hasQueued = pcgReadyCount > 0;
  interrupts();
  return hasQueued;
}

bool buildSessionPreflightReport(SessionPreflightReport *report) {
  if (!report) return false;

  memset(report, 0, sizeof(SessionPreflightReport));

  report->ecg_leads_connected = true;
  report->ecg_signal_present = true;
  report->pcg_signal_present = true;

  int16_t ecgMin = 32767;
  int16_t ecgMax = -32768;
  for (int i = 0; i < ECG_PREFLIGHT_SAMPLES; i++) {
    int16_t sample = readEcgSample();
    if (leadsOff) {
      report->ecg_leads_connected = false;
      report->ecg_signal_present = false;
      break;
    }
    if (sample < ecgMin) ecgMin = sample;
    if (sample > ecgMax) ecgMax = sample;
    delayMicroseconds(1000000 / ECG_SAMPLE_RATE);
  }

  if (report->ecg_leads_connected && ecgMin <= ecgMax) {
    report->ecg_peak_to_peak_mv = ecgMax - ecgMin;
  }
  if (!report->ecg_leads_connected) {
    appendSessionReason(report->reason, sizeof(report->reason), "ECG leads are off");
  } else if (report->ecg_peak_to_peak_mv < ECG_MIN_P2P_MV) {
    report->ecg_signal_present = false;
    appendSessionReason(report->reason, sizeof(report->reason), "ECG signal is too weak");
  }

  long pcgAbsAccumulator = 0;
  int16_t pcgMin = 32767;
  int16_t pcgMax = -32768;
  int pcgPeakAbs = 0;
  for (int i = 0; i < PCG_PREFLIGHT_SAMPLES; i++) {
    int16_t sample = (int16_t)(analogRead(MIC_PIN) - 2048);
    int absSample = sample >= 0 ? sample : -sample;
    pcgAbsAccumulator += absSample;
    if (sample < pcgMin) pcgMin = sample;
    if (sample > pcgMax) pcgMax = sample;
    if (absSample > pcgPeakAbs) pcgPeakAbs = absSample;
    delayMicroseconds(1000000 / PCG_SAMPLE_RATE);
  }

  report->pcg_mean_abs_counts = (int)(pcgAbsAccumulator / PCG_PREFLIGHT_SAMPLES);
  report->pcg_peak_to_peak_counts = pcgMax - pcgMin;
  report->pcg_peak_abs_counts = pcgPeakAbs;
  report->pcg_signal_present =
    report->pcg_mean_abs_counts >= PCG_MIN_MEAN_ABS_COUNTS &&
    report->pcg_peak_to_peak_counts >= PCG_MIN_P2P_COUNTS;
  report->pcg_clipping_detected = report->pcg_peak_abs_counts >= PCG_MAX_PEAK_ABS_COUNTS;

  if (!report->pcg_signal_present) {
    appendSessionReason(report->reason, sizeof(report->reason), "PCG signal is too weak");
  }
  if (report->pcg_clipping_detected) {
    appendSessionReason(report->reason, sizeof(report->reason), "PCG clipping detected");
  }

  report->passed =
    report->ecg_leads_connected &&
    report->ecg_signal_present &&
    report->pcg_signal_present &&
    !report->pcg_clipping_detected;

  if (report->passed && report->reason[0] == '\0') {
    strlcpy(report->reason, "ok", sizeof(report->reason));
  }

  return report->passed;
}

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
  strlcpy(bootstrap_tls_fingerprint, nvs.getString("bootstrap_tls_fingerprint", "").c_str(), sizeof(bootstrap_tls_fingerprint));
  strlcpy(bootstrap_ca_pem, nvs.getString("bootstrap_ca_pem", "").c_str(), sizeof(bootstrap_ca_pem));
  strlcpy(org_id,        nvs.getString("org_id",        DEFAULT_ORG_ID).c_str(),      sizeof(org_id));
  strlcpy(device_id,     nvs.getString("device_id",     DEFAULT_DEVICE_ID).c_str(),   sizeof(device_id));
  strlcpy(device_secret, nvs.getString("device_secret", "").c_str(),                  sizeof(device_secret));
  bootstrap_insecure = nvs.getBool("bootstrap_insecure", false);
  defaultSessionDurationSec = sanitizeSessionDurationSec(
    nvs.getInt("session_duration_sec", DEFAULT_SESSION_DURATION_SEC)
  );
  activeSessionDurationSec = defaultSessionDurationSec;

  nvs.end();

  Serial.println("[NVS] Credentials loaded:");
  Serial.printf("  WiFi SSID     : %s\n", wifi_ssid);
  Serial.printf("  MQTT Host     : %s:%d\n", mqtt_host, mqtt_port);
  Serial.printf("  Bootstrap URL : %s\n", strlen(bootstrap_url) > 0 ? bootstrap_url : "(not set)");
  Serial.printf("  Bootstrap TLS : %s\n",
    strlen(bootstrap_ca_pem) > 0 ? "ca_pem" :
    strlen(bootstrap_tls_fingerprint) > 0 ? "fingerprint" :
    bootstrap_insecure ? "insecure" : "strict");
  Serial.printf("  Device ID     : %s\n", device_id);
  Serial.printf("  Device Secret : %s\n", strlen(device_secret) > 0 ? "***set***" : "(not set)");
  Serial.printf("  Org ID        : %s\n", org_id);
  Serial.printf("  Session Dur.  : %u sec\n", defaultSessionDurationSec);
}

void saveCredential(const char *key, const char *value) {
  nvs.begin("asculticor", false);  // read-write

  if (strcmp(key, "mqtt_port") == 0) {
    nvs.putInt(key, atoi(value));
  } else if (strcmp(key, "session_duration_sec") == 0) {
    defaultSessionDurationSec = sanitizeSessionDurationSec(atoi(value));
    activeSessionDurationSec = defaultSessionDurationSec;
    nvs.putInt(key, defaultSessionDurationSec);
  } else if (strcmp(key, "bootstrap_insecure") == 0) {
    bool enabled = strcmp(value, "1") == 0 ||
                   strcasecmp(value, "true") == 0 ||
                   strcasecmp(value, "yes") == 0 ||
                   strcasecmp(value, "on") == 0;
    nvs.putBool(key, enabled);
    bootstrap_insecure = enabled;
  } else {
    nvs.putString(key, value);
  }

  nvs.end();
  Serial.printf("[NVS] Saved %s = %s\n", key, value);
}

bool shouldUseBootstrap() {
  return strlen(device_secret) > 0 && strlen(bootstrap_url) > 0;
}

String normalizedBootstrapCaPem() {
  String pem = String(bootstrap_ca_pem);
  pem.replace("|", "\n");
  return pem;
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
  
  WiFiClient client;
  WiFiClientSecure secureClient;

  if (isHttps) {
    if (strlen(bootstrap_ca_pem) > 0) {
      String caPem = normalizedBootstrapCaPem();
      secureClient.setCACert(caPem.c_str());
      Serial.println("[BOOTSTRAP] HTTPS using configured CA certificate");
    } else if (strlen(bootstrap_tls_fingerprint) > 0) {
      // NOTE: setFingerprint() removed in ESP32 Core v3.x — falling back to insecure mode.
      // For production, use bootstrap_ca_pem instead of fingerprint.
      secureClient.setInsecure();
      Serial.println("[BOOTSTRAP] WARNING: Fingerprint TLS not supported in Core v3.x — using insecure fallback");
    } else if (bootstrap_insecure) {
      secureClient.setInsecure();
      Serial.println("[BOOTSTRAP] WARNING: HTTPS bootstrap is using insecure TLS mode");
    } else {
      Serial.println("[BOOTSTRAP] HTTPS bootstrap blocked: configure bootstrap_ca_pem or bootstrap_insecure true");
      return false;
    }
    if (!http.begin(secureClient, bootstrap_url)) {
      Serial.println("[BOOTSTRAP] Failed to initialize HTTPS client");
      return false;
    }
  } else {
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

void printSerialPrompt() {
  Serial.print("> ");
}

void processProvisioningCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  Serial.printf("[PROV] Received: %s\n", line.c_str());

  if (line.startsWith("SET ")) {
    int spaceIdx = line.indexOf(' ', 4);
    if (spaceIdx > 0) {
      String key   = line.substring(4, spaceIdx);
      String value = line.substring(spaceIdx + 1);
      saveCredential(key.c_str(), value.c_str());
      Serial.printf("[PROV] Set '%s' = '%s'. REBOOT to apply.\n", key.c_str(), value.c_str());
    } else {
      Serial.println("[PROV] Usage: SET <key> <value>");
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
    Serial.printf("[STATUS] Bootstrap TLS mode: %s\n",
      strlen(bootstrap_ca_pem) > 0 ? "ca_pem" :
      strlen(bootstrap_tls_fingerprint) > 0 ? "fingerprint" :
      bootstrap_insecure ? "insecure" : "strict");
    Serial.printf("[STATUS] Session Duration Default: %u sec\n", defaultSessionDurationSec);
  } else if (line == "HELP") {
    Serial.println("Commands: SET <key> <value> | REBOOT | STATUS | HELP");
    Serial.println("Keys: wifi_ssid, wifi_pass, mqtt_host, mqtt_port, mqtt_user, mqtt_pass, bootstrap_url, bootstrap_tls_fingerprint, bootstrap_ca_pem, bootstrap_insecure, session_duration_sec, org_id, device_id, device_secret");
    Serial.println("\nRecommended bootstrap setup (from web app 'Add Device' modal):");
    Serial.println("  SET device_id     <id from web>");
    Serial.println("  SET device_secret <secret from web>");
    Serial.println("  SET bootstrap_url <http://server/api/device/bootstrap>");
    Serial.println("  SET wifi_ssid     <your WiFi name>");
    Serial.println("  SET wifi_pass     <your WiFi password>");
    Serial.println("  REBOOT");
    Serial.println("\nHTTPS bootstrap trust options:");
    Serial.println("  SET bootstrap_tls_fingerprint <AA:BB:CC:...>");
    Serial.println("  SET bootstrap_ca_pem -----BEGIN|...|END-----");
    Serial.println("  SET bootstrap_insecure true   (development only)");
    Serial.println("\nLegacy manual MQTT setup:");
    Serial.println("  SET org_id       <org from web>");
    Serial.println("  SET mqtt_host    <broker host>");
    Serial.println("  SET mqtt_port    1883");
    Serial.println("  SET mqtt_user    <broker user>");
    Serial.println("  SET mqtt_pass    <broker password>");
    Serial.println("\nOperational tuning:");
    Serial.println("  SET session_duration_sec 15");
  } else {
    Serial.printf("[PROV] Unknown command: %s\n", line.c_str());
    Serial.println("[PROV] Type HELP for available commands.");
  }

  printSerialPrompt();
}

void flushSerialProvisioningBuffer() {
  serialInputBuffer[serialInputLen] = '\0';
  processProvisioningCommand(String(serialInputBuffer));
  serialInputLen = 0;
  serialInputBuffer[0] = '\0';
}

void handleSerialProvisioning() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    lastSerialByteMs = millis();

    if (c == '\r' || c == '\n') {
      if (serialInputLen > 0) {
        flushSerialProvisioningBuffer();
      }
      continue;
    }

    if (serialInputLen >= SERIAL_COMMAND_BUFFER - 1) {
      Serial.println("[PROV] Input too long, clearing serial buffer.");
      serialInputLen = 0;
      serialInputBuffer[0] = '\0';
      printSerialPrompt();
      continue;
    }

    if (c >= 32 && c <= 126) {
      serialInputBuffer[serialInputLen++] = c;
      serialInputBuffer[serialInputLen] = '\0';
    }
  }

  if (serialInputLen > 0 && millis() - lastSerialByteMs >= SERIAL_COMMAND_IDLE_MS) {
    flushSerialProvisioningBuffer();
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
  // ESP32 Core v3.x API: timerBegin(frequency_hz)
  // 500 Hz → period = 1/500 s → we configure timer at 1 MHz and alarm every 2000 ticks
  ecgTimer = timerBegin(1000000);                     // 1 MHz base clock
  timerAttachInterrupt(ecgTimer, &onEcgTimerISR);     // No edge arg in v3.x
  timerAlarm(ecgTimer, 2000, true, 0);                // 2000 ticks @ 1MHz = 2ms = 500 Hz
  Serial.println("[ECG] Hardware timer started: 500 Hz");
}

// --- PCG Timer ISR (22050 Hz) ---
//   Reads MAX9814 analog output directly in the ISR.
//   analogRead() takes ~10 µs on ESP32 — well within the 45 µs period.
void IRAM_ATTR onPcgTimerISR() {
  if (!isStreaming) return;

  if (pcgBufferStates[pcgWriteBufIdx] != PCG_BUF_FILLING) {
    pcgBufferStates[pcgWriteBufIdx] = PCG_BUF_FILLING;
  }

  // Read MAX9814 analog output (0-4095, 12-bit, biased at ~VCC/2)
  int raw = analogRead(MIC_PIN);

  // Center around zero (MAX9814 output is biased at ~VCC/2 ≈ 1.65V ≈ 2048)
  int16_t sample = (int16_t)(raw - 2048);

  // Store in current write buffer
  pcgBuffers[pcgWriteBufIdx][pcgSampleIdx] = sample;
  pcgSampleIdx++;

  // Buffer full → swap
  if (pcgSampleIdx >= PCG_CHUNK_SAMPLES) {
    int completedBuf = pcgWriteBufIdx;
    int nextBuf = findNextFreePcgBuffer(completedBuf);

    if (nextBuf < 0) {
      pcgDroppedBuffers++;
      pcgSampleIdx = 0;
      return;
    }

    pcgReadyQueue[pcgReadyTail] = completedBuf;
    pcgReadyTail = (pcgReadyTail + 1) % PCG_NUM_BUFFERS;
    pcgReadyCount++;
    pcgBufferStates[completedBuf] = PCG_BUF_READY;

    pcgWriteBufIdx = nextBuf;
    pcgBufferStates[pcgWriteBufIdx] = PCG_BUF_FILLING;
    pcgSampleIdx = 0;
  }
}

void setupPcgTimer() {
  // ESP32 Core v3.x API: timerBegin(frequency_hz)
  // 22050 Hz → alarm every 45 ticks @ 1 MHz ≈ 22222 Hz
  pcgTimer = timerBegin(1000000);                     // 1 MHz base clock
  timerAttachInterrupt(pcgTimer, &onPcgTimerISR);     // No edge arg in v3.x
  timerAlarm(pcgTimer, 45, true, 0);                  // 45 ticks @ 1MHz = 45µs ≈ 22222 Hz
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
    Serial.println("[MQTT] Stop requested");
    stopSessionRequested = true;
  } else if (strcmp(command, "start") == 0 && !isStreaming) {
    if (sessionCooldownUntilMs != 0 && millis() < sessionCooldownUntilMs) {
      unsigned long remainingMs = sessionCooldownUntilMs - millis();
      Serial.printf("[MQTT] Start requested during cooldown (%lu ms remaining)\n", remainingMs);
      return;
    }

    const char *new_session_id = doc["session_id"];
    int requestedDurationSec = doc["duration_sec"] | 0;
    if (new_session_id) {
      Serial.printf("[MQTT] Start requested for session: %s\n", new_session_id);
      startSession(new_session_id, requestedDurationSec);
    } else {
      Serial.println("[MQTT] Start requested but no session_id provided.");
    }
  }
}

bool mqttReconnect() {
  char clientId[48];
  snprintf(clientId, sizeof(clientId), "ESP32-%s", device_id);

  char statusTopic[140];
  buildTopic(statusTopic, sizeof(statusTopic), "status");
  const char *offlineStatusPayload = "{\"status\":\"offline\"}";

  if (shouldUseBootstrap() && WiFi.status() == WL_CONNECTED) {
    fetchBootstrapConfig();
  }

  Serial.printf("[MQTT] Connecting as %s to %s:%d (auth: mqtt_user/mqtt_pass)...\n",
                clientId, mqtt_host, mqtt_port);

  if (mqtt.connect(clientId, mqtt_user, mqtt_pass, statusTopic, 1, true, offlineStatusPayload)) {
    Serial.println("[MQTT] Connected!");

    // Subscribe to control topic
    char controlTopic[140];
    buildTopic(controlTopic, sizeof(controlTopic), "control");
    mqtt.subscribe(controlTopic);
    publishDeviceStatus();
    lastDeviceStatusMs = millis();

    setLedPattern(LED_CONNECTED);
    return true;
  }

  Serial.printf("[MQTT] Failed, rc=%d\n", mqtt.state());
  return false;
}

void publishDeviceStatus() {
  if (!mqtt.connected()) return;

  char statusTopic[140];
  buildTopic(statusTopic, sizeof(statusTopic), "status");

  StaticJsonDocument<256> doc;
  doc["status"] = "online";
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["firmware_version"] = "3.0.0";
  doc["free_heap"] = ESP.getFreeHeap();
  doc["mic_type"] = "MAX9814";
  doc["default_session_duration_sec"] = defaultSessionDurationSec;
  doc["quality_gate_enabled"] = true;
  doc["streaming"] = isStreaming;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(statusTopic, buf, true);
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
    doc["target_duration_sec"] = activeSessionDurationSec;
    doc["microphone"]         = "MAX9814";
    doc["gain_db"]            = 60;
  } else if (strcmp(type, "start_ecg") == 0) {
    doc["sample_rate_hz"]   = ECG_SAMPLE_RATE;
    doc["format"]           = "int16_mv";
    doc["lead"]             = "MLII";
    doc["chunk_samples"]    = ECG_BUFFER_SIZE;
    doc["adc_resolution"]   = 12;
    doc["target_duration_sec"] = activeSessionDurationSec;
  }

  if (extraKey && extraKey[0] != '\0') {
    if (hasInt) {
      doc[extraKey] = extraInt;
    } else if (extraVal) {
      doc[extraKey] = extraVal;
    }
  }

  char buf[512];
  serializeJson(doc, buf);
  mqtt.publish(topic, buf, false);  // NOT retained for session data

  Serial.printf("[META] Sent: %s\n", type);
}

void publishSessionPreflightMeta(const char *type, const SessionPreflightReport &report) {
  char topic[160];
  buildSessionTopic(topic, sizeof(topic), "meta");

  StaticJsonDocument<768> doc;
  doc["type"] = type;
  doc["session_id"] = session_id;
  doc["device_id"] = device_id;
  doc["timestamp_ms"] = millis();
  doc["requested_duration_sec"] = activeSessionDurationSec;
  doc["passed"] = report.passed;
  doc["reason"] = report.reason;
  doc["ecg_leads_connected"] = report.ecg_leads_connected;
  doc["ecg_signal_present"] = report.ecg_signal_present;
  doc["ecg_peak_to_peak_mv"] = report.ecg_peak_to_peak_mv;
  doc["pcg_signal_present"] = report.pcg_signal_present;
  doc["pcg_clipping_detected"] = report.pcg_clipping_detected;
  doc["pcg_mean_abs_counts"] = report.pcg_mean_abs_counts;
  doc["pcg_peak_to_peak_counts"] = report.pcg_peak_to_peak_counts;
  doc["pcg_peak_abs_counts"] = report.pcg_peak_abs_counts;

  char buf[768];
  serializeJson(doc, buf);
  mqtt.publish(topic, buf, false);

  Serial.printf("[META] Sent: %s (%s)\n", type, report.reason);
}

void reportPcgPublishBacklogIfNeeded() {
  uint32_t droppedBuffersTotal = 0;
  noInterrupts();
  droppedBuffersTotal = pcgDroppedBuffers;
  interrupts();

  if (droppedBuffersTotal <= lastReportedPcgDropCount) return;

  lastReportedPcgDropCount = droppedBuffersTotal;
  Serial.printf("[PCG] WARNING: %lu chunk(s) dropped due to publish backlog\n", droppedBuffersTotal);
  publishSessionMeta(
    "warning_pcg_overflow",
    "dropped_buffers_total",
    nullptr,
    (int)droppedBuffersTotal,
    true
  );
}

void flushPendingPcgBuffers(unsigned long timeoutMs) {
  unsigned long flushStartedAt = millis();
  while (mqtt.connected() && hasQueuedPcgBuffers() && millis() - flushStartedAt < timeoutMs) {
    processPcgBuffer();
    delay(1);
  }
}

void flushPartialPcgBuffer() {
  if (!mqtt.connected()) return;

  int bufToSend = -1;
  int sampleCount = 0;
  noInterrupts();
  if (pcgSampleIdx > 0 && pcgBufferStates[pcgWriteBufIdx] == PCG_BUF_FILLING) {
    bufToSend = pcgWriteBufIdx;
    sampleCount = pcgSampleIdx;
    pcgSampleIdx = 0;
    pcgBufferStates[bufToSend] = PCG_BUF_FREE;
  }
  interrupts();

  if (bufToSend < 0 || sampleCount <= 0) return;

  char topic[160];
  buildSessionTopic(topic, sizeof(topic), "pcg");
  size_t payloadBytes = (size_t)sampleCount * sizeof(int16_t);
  mqtt.publish(topic, (byte *)pcgBuffers[bufToSend], payloadBytes, false);
  Serial.printf("[PCG] Flushed final partial chunk (%d samples)\n", sampleCount);
}

void flushPartialEcgBuffer() {
  if (!mqtt.connected() || ecgBufferIdx <= 0) return;

  char topic[160];
  buildSessionTopic(topic, sizeof(topic), "ecg");
  size_t payloadBytes = (size_t)ecgBufferIdx * sizeof(int16_t);
  mqtt.publish(topic, (byte *)ecgBuffer, payloadBytes, false);
  Serial.printf("[ECG] Flushed final partial chunk (%d samples)\n", ecgBufferIdx);
  ecgBufferIdx = 0;
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
  doc["pcg_dropped_buffers"] = pcgDroppedBuffers;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(topic, buf, false);
}

// ═══════════════════════════════════════════════════════════════
//  PCG STREAMING (timer-driven, send from main loop)
// ═══════════════════════════════════════════════════════════════
void processPcgBuffer() {
  if (!mqtt.connected()) return;

  reportPcgPublishBacklogIfNeeded();

  int bufToSend = -1;
  noInterrupts();
  if (pcgReadyCount > 0) {
    bufToSend = pcgReadyQueue[pcgReadyHead];
    pcgReadyQueue[pcgReadyHead] = -1;
    pcgReadyHead = (pcgReadyHead + 1) % PCG_NUM_BUFFERS;
    pcgReadyCount--;
    pcgBufferStates[bufToSend] = PCG_BUF_SENDING;
  }
  interrupts();

  if (bufToSend < 0) return;

  char topic[160];
  buildSessionTopic(topic, sizeof(topic), "pcg");
  size_t payloadBytes = PCG_CHUNK_SAMPLES * sizeof(int16_t);

  if (payloadBytes <= MQTT_BUFFER_BYTES) {
    if (!mqtt.publish(topic, (byte *)pcgBuffers[bufToSend], payloadBytes, false)) {
      Serial.println("[PCG] WARNING: MQTT publish failed for full chunk");
    }
  } else {
    Serial.printf("[PCG] WARNING: chunk %d > MQTT buffer %d!\n",
                  payloadBytes, MQTT_BUFFER_BYTES);
  }

  noInterrupts();
  pcgBufferStates[bufToSend] = PCG_BUF_FREE;
  interrupts();
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
void startSession(const char* new_session_id, uint16_t requestedDurationSec) {
  if (new_session_id) {
    strlcpy(session_id, new_session_id, sizeof(session_id));
  } else {
    generateUUID(session_id);
  }
  activeSessionDurationSec = requestedDurationSec > 0
    ? sanitizeSessionDurationSec(requestedDurationSec)
    : defaultSessionDurationSec;
  Serial.printf("\n[SESSION] ═══ Starting session: %s ═══\n", session_id);

  ecgBufferIdx = 0;
  resetPcgBufferQueue();
  stopSessionRequested = false;

  SessionPreflightReport preflightReport;
  setLedPattern(LED_CONNECTING);
  if (!buildSessionPreflightReport(&preflightReport)) {
    publishSessionPreflightMeta("preflight_failed", preflightReport);
    Serial.printf("[SESSION] Preflight failed: %s\n", preflightReport.reason);
    setLedPattern(LED_ERROR);
    return;
  }

  publishSessionPreflightMeta("preflight_ok", preflightReport);
  publishSessionMeta("start_pcg");
  delay(150);
  publishSessionMeta("start_ecg");

  streamStartMs = millis();
  lastHeartbeatMs = streamStartMs;
  isStreaming = true;
  setLedPattern(LED_STREAMING);

  Serial.printf("[SESSION] Recording for %u seconds...\n", activeSessionDurationSec);
}

void endSession() {
  stopSessionRequested = false;
  isStreaming = false;
  setLedPattern(LED_CONNECTED);
  sessionCooldownUntilMs = millis() + (INTER_SESSION_SEC * 1000UL);

  flushPendingPcgBuffers(250);
  flushPartialPcgBuffer();
  flushPartialEcgBuffer();
  delay(50);

  publishSessionMeta("end_pcg");
  delay(100);
  publishSessionMeta("end_ecg");
  publishDeviceStatus();
  lastDeviceStatusMs = millis();

  Serial.printf("[SESSION] ═══ Session %s complete ═══\n", session_id);
  Serial.println("[SESSION] Results will appear in the web dashboard.");
  Serial.printf("[SESSION] Cooldown active for %d seconds (non-blocking).\n", INTER_SESSION_SEC);
}

// ═══════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==========================================");
  Serial.println("SONOCARDIA ESP32 v3.0");
  Serial.println("Cardiac Monitoring Firmware");
  Serial.println("Sensors: AD8232 (ECG) + MAX9814 (PCG)");
  Serial.println("==========================================");
  Serial.println();
  Serial.println("Type HELP for serial provisioning commands.");
  Serial.println("Serial monitor baud: 115200. Any line ending works.");
  printSerialPrompt();
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
  mqtt.setKeepAlive(MQTT_KEEPALIVE_SEC);

  // Hardware timer for precise ECG sampling (500 Hz)
  setupEcgTimer();

  // Hardware timer for precise PCG sampling (22050 Hz via MAX9814)
  setupPcgTimer();
  resetPcgBufferQueue();

  Serial.println();
  Serial.println("[SETUP] OK. Entering main loop...");
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

  // Refresh time after mqtt.loop() / callbacks.
  // A start command can update streamStartMs inside mqttCallback(),
  // so using the old 'now' from the start of loop() can underflow and
  // make the duration check think 10s already elapsed.
  now = millis();

  if (now - lastDeviceStatusMs >= DEVICE_STATUS_INTERVAL_MS) {
    publishDeviceStatus();
    lastDeviceStatusMs = now;
  }

  // ── Session auto-start when connected ──
  // if (!isStreaming && mqtt.connected()) {
  //   startSession();
  // }

  // ── Heartbeat ──
  if (isStreaming && now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeatMs = now;
  }

  // ── Session duration check ──
  if (isStreaming && stopSessionRequested) {
    endSession();
    now = millis();
  }

  if (isStreaming && now - streamStartMs >= (activeSessionDurationSec * 1000UL)) {
    endSession();
  }

  if (!isStreaming && sessionCooldownUntilMs != 0 && now >= sessionCooldownUntilMs) {
    sessionCooldownUntilMs = 0;
    Serial.println("[SESSION] Cooldown complete. Ready for next session.");
  }
}
