/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║               AscultiCor — ESP32 Firmware                    ║
 * ║       Real-Time Cardiac Monitoring (ECG + PCG)               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 🔒 SECURITY NOTE: Default credentials in this file are for
 *    DEVELOPMENT ONLY. Change WiFi and MQTT passwords before
 *    production deployment. Use Serial provisioning to set
 *    device-specific credentials securely.
 *
 * Architecture:
 *   FreeRTOS task    → ECG sampling  (AD8232, 500 Hz via ADC)
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
#include <Update.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>   // NVS flash storage for credentials
#include <mbedtls/sha256.h>
#include <strings.h>
#include <time.h>

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
#define FIRMWARE_VERSION        "3.1.2"
#define PROVISIONING_AP_PREFIX  "AscultiCor-Setup-"

// Public root CA used to validate the Let's Encrypt certificate presented by
// the production MQTT endpoint. No private certificate material is stored here.
static const char ISRG_ROOT_X1[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

// Default device identity — MUST be overridden via serial provisioning before use.
// Commands: SET device_id <uuid>  and  SET device_secret <secret>
// These placeholder values will be rejected by the inference service.
#define DEFAULT_ORG_ID          "00000000-0000-0000-0000-000000000000"
#define DEFAULT_DEVICE_ID       "00000000-0000-0000-0000-000000000000"

// ═══════════════════════════════════════════════════════════════
//  SAMPLING CONSTANTS
// ═══════════════════════════════════════════════════════════════
#define ECG_SAMPLE_RATE         500       // Hz (exact: 1 MHz / 2000 timer ticks)
#define PCG_SAMPLE_RATE         22050     // Hz (target / training rate — used for display only)
#define PCG_ACTUAL_SAMPLE_RATE  (1000000 / 45)  // 22222 Hz — real hardware timer rate
#define ECG_BUFFER_SIZE         500       // 1 s of ECG samples
#define ECG_QUEUE_SAMPLES       1024      // Decouple 500 Hz acquisition from MQTT publishing
#define ECG_DRAIN_BATCH         64        // Bound loop work while catching up after network delays
#define PCG_CHUNK_SAMPLES       512       // Samples per MQTT chunk
#define DEFAULT_SESSION_DURATION_SEC 15   // Default recording window
#define MIN_SESSION_DURATION_SEC  8
#define MAX_SESSION_DURATION_SEC  60
#define INTER_SESSION_SEC       30        // Pause between sessions
#define HEARTBEAT_INTERVAL_MS   5000
#define DEVICE_STATUS_INTERVAL_MS 10000
#define MQTT_BUFFER_BYTES       4096
#define MQTT_KEEPALIVE_SEC      15
#define WIFI_RETRY_MS           10000
#define MQTT_RETRY_MS           5000
#define SERIAL_COMMAND_BUFFER   1024
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
                            // MAX9814 Gain → leave floating for 60dB
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
void publishFirmwareEvent(const char *state, const char *targetVersion, const char *detail);

WiFiClient         espClient;
WiFiClientSecure   mqttSecureClient;
PubSubClient       mqtt(espClient);
Preferences        nvs;
WebServer          provisioningServer(80);
DNSServer          provisioningDns;

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
bool mqtt_tls = false;
bool provisioningPortalActive = false;
bool otaInProgress = false;
uint16_t defaultSessionDurationSec = DEFAULT_SESSION_DURATION_SEC;
uint16_t activeSessionDurationSec  = DEFAULT_SESSION_DURATION_SEC;

// State
volatile bool     isStreaming       = false;
volatile bool     pcgCaptureEnabled = false;
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
int16_t           ecgSampleQueue[ECG_QUEUE_SAMPLES];
volatile uint16_t ecgQueueHead      = 0;
volatile uint16_t ecgQueueTail      = 0;
volatile uint16_t ecgQueueCount     = 0;
volatile uint32_t ecgDroppedSamples = 0;
portMUX_TYPE      ecgQueueMux       = portMUX_INITIALIZER_UNLOCKED;
TaskHandle_t      ecgSamplingTaskHandle = nullptr;

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

// Hardware timer
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

  // ECG is required. PCG is optional: its quality is still reported, but an
  // unavailable microphone must not block a valid ECG-only session.
  report->passed =
    report->ecg_leads_connected &&
    report->ecg_signal_present;

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
  mqtt_tls = nvs.getBool("mqtt_tls", false);
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
  Serial.printf("  MQTT TLS      : %s\n", mqtt_tls ? "enabled" : "disabled");
  Serial.printf("  Bootstrap URL : %s\n", strlen(bootstrap_url) > 0 ? bootstrap_url : "(not set)");
  Serial.printf("  Bootstrap TLS : %s\n",
    strlen(bootstrap_ca_pem) > 0 ? "ca_pem" :
    strlen(bootstrap_tls_fingerprint) > 0 ? "fingerprint" :
    bootstrap_insecure ? "insecure" : "strict");
  Serial.printf("  Device ID     : %s\n", device_id);
  Serial.printf("  Device Secret : %s\n", strlen(device_secret) > 0 ? "***set***" : "(not set)");
  Serial.printf("  Org ID        : %s\n", org_id);
  Serial.printf("  Session Dur.  : %u sec\n", defaultSessionDurationSec);

  // Warn if still running with stub (unprovisioned) UUIDs
  if (strncmp(device_id, "00000000-0000-0000-0000-000000000000", 36) == 0) {
    Serial.println();
    Serial.println("[WARN] *** DEVICE NOT PROVISIONED ***");
    Serial.println("[WARN] Device ID is the default stub. Device will be rejected by the server.");
    Serial.println("[WARN] Run these commands in Serial Monitor to provision:");
    Serial.println("[WARN]   SET device_id     <uuid-from-dashboard>");
    Serial.println("[WARN]   SET device_secret <secret-from-dashboard>");
    Serial.println("[WARN]   SET bootstrap_url http://<host-ip>/api/device/bootstrap");
    Serial.println("[WARN]   REBOOT");
    Serial.println();
  }
}

void saveCredential(const char *key, const char *value) {
  nvs.begin("asculticor", false);  // read-write

  if (strcmp(key, "mqtt_port") == 0) {
    nvs.putInt(key, atoi(value));
  } else if (strcmp(key, "mqtt_tls") == 0) {
    bool enabled = strcmp(value, "1") == 0 ||
                   strcasecmp(value, "true") == 0 ||
                   strcasecmp(value, "yes") == 0 ||
                   strcasecmp(value, "on") == 0;
    nvs.putBool(key, enabled);
    mqtt_tls = enabled;
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
  if (
    strcmp(key, "wifi_pass") == 0 ||
    strcmp(key, "device_secret") == 0 ||
    strcmp(key, "mqtt_pass") == 0
  ) {
    Serial.printf("[NVS] Saved %s = ********\n", key);
  } else {
    Serial.printf("[NVS] Saved %s = %s\n", key, value);
  }
}

bool shouldUseBootstrap() {
  return strlen(device_secret) > 0 && strlen(bootstrap_url) > 0;
}

String normalizedBootstrapCaPem() {
  String pem = String(bootstrap_ca_pem);
  pem.replace("|", "\n");
  return pem;
}

bool syncTlsClock() {
  const time_t minimumValidTime = 1704067200;  // 2024-01-01 UTC
  if (time(nullptr) >= minimumValidTime) return true;

  Serial.println("[TLS] Synchronizing clock with NTP...");
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  unsigned long startedAt = millis();
  while (time(nullptr) < minimumValidTime && millis() - startedAt < 15000) {
    delay(250);
  }

  if (time(nullptr) < minimumValidTime) {
    Serial.println("[TLS] Clock synchronization failed; certificate validation is unavailable");
    return false;
  }
  Serial.println("[TLS] Clock synchronized");
  return true;
}

bool configureMqttTransport() {
  mqtt.disconnect();
  if (!mqtt_tls) {
    mqtt.setClient(espClient);
    mqtt.setServer(mqtt_host, mqtt_port);
    return true;
  }

  if (!syncTlsClock()) return false;
  mqttSecureClient.stop();
  mqttSecureClient.setCACert(ISRG_ROOT_X1);
  mqtt.setClient(mqttSecureClient);
  mqtt.setServer(mqtt_host, mqtt_port);
  Serial.println("[MQTT] TLS certificate validation enabled");
  return true;
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
      // setFingerprint() was removed in ESP32 Core v3.x. This mode is no longer supported.
      // REQUIRED ACTION: Use bootstrap_ca_pem for HTTPS bootstrap instead.
      //   SET bootstrap_ca_pem <your-PEM-certificate>
      // Or for local development only:
      //   SET bootstrap_insecure true
      Serial.println("[BOOTSTRAP] ERROR: TLS fingerprint mode is not supported on ESP32 Core v3.x.");
      Serial.println("[BOOTSTRAP] Configure bootstrap_ca_pem, or set bootstrap_insecure=true for dev.");
      return false;
    } else if (bootstrap_insecure) {
      secureClient.setInsecure();
      Serial.println("[BOOTSTRAP] WARNING: HTTPS bootstrap is using insecure TLS mode");
    } else {
      if (!syncTlsClock()) {
        Serial.println("[BOOTSTRAP] HTTPS bootstrap blocked: device clock is not synchronized");
        return false;
      }
      secureClient.setCACert(ISRG_ROOT_X1);
      Serial.println("[BOOTSTRAP] HTTPS using built-in ISRG Root X1 certificate");
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
  Serial.printf("[BOOTSTRAP] HTTP %d, response bytes=%d\n", httpCode, responseBody.length());

  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("[BOOTSTRAP] Server returned HTTP %d: %s\n", httpCode, responseBody.c_str());
    return false;
  }

  StaticJsonDocument<2048> responseDoc;
  DeserializationError err = deserializeJson(responseDoc, responseBody);
  if (err) {
    Serial.printf("[BOOTSTRAP] Invalid JSON response: %s\n", err.c_str());
    return false;
  }

  JsonObject mqttConfig = responseDoc["mqtt"].as<JsonObject>();
  const char *flatMqttHost = responseDoc["mqtt_host"].as<const char *>();
  const char *flatMqttUser = responseDoc["mqtt_user"].as<const char *>();
  const char *flatMqttPass = responseDoc["mqtt_pass"].as<const char *>();
  const char *nestedMqttHost = mqttConfig["host"].as<const char *>();
  const char *nestedMqttUser = mqttConfig["username"].as<const char *>();
  const char *nestedMqttPass = mqttConfig["password"].as<const char *>();
  const char *newMqttHost = flatMqttHost ? flatMqttHost : nestedMqttHost;
  const char *newMqttUser = flatMqttUser ? flatMqttUser : nestedMqttUser;
  const char *newMqttPass = flatMqttPass ? flatMqttPass : nestedMqttPass;
  const char *newOrgId    = responseDoc["org_id"].as<const char *>();
  int newMqttPort         = responseDoc["mqtt_port"] | (mqttConfig["port"] | DEFAULT_MQTT_PORT);
  bool newMqttTls         = responseDoc["mqtt_tls"] | (mqttConfig["tls"] | false);

  if (!newMqttHost || !newMqttUser || !newMqttPass || !newOrgId) {
    Serial.printf("[BOOTSTRAP] Field presence: host=%s user=%s pass=%s org=%s overflow=%s\n",
                  newMqttHost ? "yes" : "no",
                  newMqttUser ? "yes" : "no",
                  newMqttPass ? "yes" : "no",
                  newOrgId ? "yes" : "no",
                  responseDoc.overflowed() ? "yes" : "no");
    Serial.println("[BOOTSTRAP] Response missing required broker fields");
    return false;
  }

  strlcpy(mqtt_host, newMqttHost, sizeof(mqtt_host));
  strlcpy(mqtt_user, newMqttUser, sizeof(mqtt_user));
  strlcpy(mqtt_pass, newMqttPass, sizeof(mqtt_pass));
  strlcpy(org_id, newOrgId, sizeof(org_id));
  mqtt_port = newMqttPort;
  mqtt_tls = newMqttTls;

  saveCredential("mqtt_host", mqtt_host);
  saveCredential("mqtt_user", mqtt_user);
  saveCredential("mqtt_pass", mqtt_pass);
  saveCredential("org_id", org_id);
  char portBuf[8];
  snprintf(portBuf, sizeof(portBuf), "%d", mqtt_port);
  saveCredential("mqtt_port", portBuf);
  saveCredential("mqtt_tls", mqtt_tls ? "true" : "false");

  buildTopicBase();
  if (!configureMqttTransport()) {
    Serial.println("[BOOTSTRAP] MQTT TLS transport configuration failed");
    return false;
  }

  Serial.printf("[BOOTSTRAP] Loaded broker config: %s:%d tls=%s\n",
                mqtt_host, mqtt_port, mqtt_tls ? "true" : "false");
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

void printJsonStatus(const char *stage = "status") {
  StaticJsonDocument<512> doc;
  doc["status"] = "ok";
  doc["stage"] = stage;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["provisioned"] = shouldUseBootstrap();
  doc["wifi"] = WiFi.isConnected() ? "connected" : "disconnected";
  doc["mqtt"] = mqtt.connected() ? "connected" : "disconnected";
  doc["device_id"] = device_id;
  doc["ip"] = WiFi.isConnected() ? WiFi.localIP().toString() : "";
  doc["mode"] = "real_hardware";
  serializeJson(doc, Serial);
  Serial.println();
}

void printJsonError(const char *code, const char *message) {
  StaticJsonDocument<192> doc;
  doc["status"] = "error";
  doc["code"] = code;
  doc["message"] = message;
  serializeJson(doc, Serial);
  Serial.println();
}

void printJsonPreflight(const SessionPreflightReport &report) {
  StaticJsonDocument<768> doc;
  doc["status"] = report.passed ? "ok" : "error";
  doc["stage"] = "preflight";
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["device_id"] = device_id;
  doc["mode"] = "real_hardware";
  doc["message"] = report.reason;

  JsonObject ecg = doc.createNestedObject("ecg");
  ecg["sensor"] = "AD8232";
  ecg["connected"] = report.ecg_leads_connected;
  ecg["lead_off"] = !report.ecg_leads_connected;
  ecg["sample_rate_hz"] = ECG_SAMPLE_RATE;
  ecg["signal_detected"] = report.ecg_signal_present;
  ecg["peak_to_peak_mv"] = report.ecg_peak_to_peak_mv;

  JsonObject pcg = doc.createNestedObject("pcg");
  pcg["sensor"] = "MAX9814";
  pcg["connected"] = true;
  pcg["sample_rate_hz"] = PCG_SAMPLE_RATE;
  pcg["signal_detected"] = report.pcg_signal_present;
  pcg["overflow"] = report.pcg_clipping_detected;
  pcg["mean_abs_counts"] = report.pcg_mean_abs_counts;
  pcg["peak_to_peak_counts"] = report.pcg_peak_to_peak_counts;

  serializeJson(doc, Serial);
  Serial.println();
}

void clearProvisioning() {
  nvs.begin("asculticor", false);
  nvs.remove("wifi_ssid");
  nvs.remove("wifi_pass");
  nvs.remove("device_id");
  nvs.remove("device_secret");
  nvs.remove("bootstrap_url");
  nvs.remove("bootstrap_insecure");
  nvs.remove("mqtt_host");
  nvs.remove("mqtt_port");
  nvs.remove("mqtt_user");
  nvs.remove("mqtt_pass");
  nvs.remove("org_id");
  nvs.end();
  loadCredentials();
  buildTopicBase();
}

void saveJsonString(StaticJsonDocument<1024> &doc, const char *jsonKey, const char *nvsKey, bool required, bool *ok) {
  const char *value = doc[jsonKey];
  if (!value || strlen(value) == 0) {
    if (required) {
      *ok = false;
    }
    return;
  }
  saveCredential(nvsKey, value);
}

bool processJsonProvisioningCommand(String line) {
  if (!line.startsWith("{")) return false;

  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, line);
  if (err) {
    printJsonError("INVALID_JSON", "Serial command was not valid JSON");
    return true;
  }

  const char *cmd = doc["cmd"];
  if (!cmd || strlen(cmd) == 0) {
    printJsonError("MISSING_CMD", "JSON command requires cmd");
    return true;
  }

  if (strcmp(cmd, "provision") == 0) {
    bool ok = true;
    saveJsonString(doc, "device_id", "device_id", true, &ok);
    saveJsonString(doc, "device_secret", "device_secret", true, &ok);
    saveJsonString(doc, "bootstrap_url", "bootstrap_url", true, &ok);
    saveJsonString(doc, "wifi_ssid", "wifi_ssid", true, &ok);
    saveJsonString(doc, "wifi_pass", "wifi_pass", true, &ok);
    saveJsonString(doc, "org_id", "org_id", false, &ok);
    saveJsonString(doc, "mqtt_host", "mqtt_host", false, &ok);
    saveJsonString(doc, "mqtt_user", "mqtt_user", false, &ok);
    saveJsonString(doc, "mqtt_pass", "mqtt_pass", false, &ok);

    int newMqttPort = doc["mqtt_port"] | 0;
    if (newMqttPort > 0) {
      char portBuf[8];
      snprintf(portBuf, sizeof(portBuf), "%d", newMqttPort);
      saveCredential("mqtt_port", portBuf);
    }

    if (!ok) {
      printJsonError("MISSING_REQUIRED_FIELD", "Provision command requires device_id, device_secret, bootstrap_url, wifi_ssid, and wifi_pass");
      return true;
    }

    loadCredentials();
    buildTopicBase();
    StaticJsonDocument<192> response;
    response["status"] = "ok";
    response["stage"] = "saved_to_nvs";
    response["device_id"] = device_id;
    response["firmware_version"] = FIRMWARE_VERSION;
    serializeJson(response, Serial);
    Serial.println();
    return true;
  }

  if (strcmp(cmd, "status") == 0) {
    printJsonStatus();
    return true;
  }

  if (strcmp(cmd, "reset_provisioning") == 0) {
    clearProvisioning();
    printJsonStatus("provisioning_reset");
    return true;
  }

  if (strcmp(cmd, "preflight") == 0 || strcmp(cmd, "test_ecg") == 0 || strcmp(cmd, "test_pcg") == 0) {
    SessionPreflightReport report;
    buildSessionPreflightReport(&report);
    printJsonPreflight(report);
    return true;
  }

  if (strcmp(cmd, "reboot") == 0) {
    StaticJsonDocument<128> response;
    response["status"] = "ok";
    response["stage"] = "rebooting";
    serializeJson(response, Serial);
    Serial.println();
    delay(500);
    ESP.restart();
    return true;
  }

  printJsonError("UNKNOWN_COMMAND", "Unsupported JSON serial command");
  return true;
}

void processProvisioningCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (processJsonProvisioningCommand(line)) {
    printSerialPrompt();
    return;
  }

  if (line.indexOf("wifi_pass") >= 0 || line.indexOf("device_secret") >= 0 || line.indexOf("mqtt_pass") >= 0) {
    Serial.println("[PROV] Received sensitive legacy command (masked)");
  } else {
    Serial.printf("[PROV] Received: %s\n", line.c_str());
  }

  if (line.startsWith("SET ")) {
    int spaceIdx = line.indexOf(' ', 4);
    if (spaceIdx > 0) {
      String key   = line.substring(4, spaceIdx);
      String value = line.substring(spaceIdx + 1);
      saveCredential(key.c_str(), value.c_str());
      if (key == "wifi_pass" || key == "device_secret" || key == "mqtt_pass") {
        Serial.printf("[PROV] Set '%s' = '********'. REBOOT to apply.\n", key.c_str());
      } else {
        Serial.printf("[PROV] Set '%s' = '%s'. REBOOT to apply.\n", key.c_str(), value.c_str());
      }
    } else {
      Serial.println("[PROV] Usage: SET <key> <value>");
    }
  } else if (line == "REBOOT") {
    Serial.println("[PROV] Rebooting...");
    delay(500);
    ESP.restart();
  } else if (line == "STATUS") {
    printJsonStatus();
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
    Serial.println("Commands: JSON lines {\"cmd\":\"provision\"} | SET <key> <value> | REBOOT | STATUS | HELP");
    Serial.println("JSON commands: provision, reboot, status, reset_provisioning, preflight, test_ecg, test_pcg");
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
bool deviceIdentityProvisioned() {
  return strlen(device_secret) > 0 &&
         strlen(bootstrap_url) > 0 &&
         strncmp(device_id, "00000000-0000-0000-0000-000000000000", 36) != 0;
}

bool wifiCredentialsProvisioned() {
  return strlen(wifi_ssid) > 0 &&
         strcmp(wifi_ssid, "YOUR_WIFI_SSID") != 0;
}

String htmlEscape(const String &value) {
  String escaped = value;
  escaped.replace("&", "&amp;");
  escaped.replace("<", "&lt;");
  escaped.replace(">", "&gt;");
  escaped.replace("\"", "&quot;");
  escaped.replace("'", "&#039;");
  return escaped;
}

String provisioningPage(const String &message = "") {
  String page = F(
    "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>AscultiCor Setup</title><style>"
    "body{font-family:Arial,sans-serif;background:#f2f6f8;color:#0b1f3a;margin:0;padding:24px}"
    ".card{max-width:520px;margin:auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 28px #0b1f3a18}"
    "h1{margin-top:0}label{display:block;font-weight:700;margin:14px 0 5px}"
    "input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #cad5df;border-radius:8px}"
    "button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:8px;background:#0f766e;color:white;font-weight:700}"
    ".note{font-size:13px;color:#526579;line-height:1.5}.msg{padding:10px;background:#e7f7f4;border-radius:8px}"
    ".steps{padding:14px 16px;background:#e8f4f8;border:1px solid #b9dbe5;border-radius:10px;line-height:1.55}"
    ".fallback{margin-top:22px;padding-top:18px;border-top:1px solid #dce5eb}"
    "</style></head><body><div class='card'><h1>AscultiCor Device Setup</h1>"
    "<div class='steps'><strong>Recommended: scan the AscultiCor QR</strong><ol>"
    "<li>On another screen, sign in to AscultiCor and choose <b>Devices &gt; Add Device</b>.</li>"
    "<li>Enter the Wi-Fi name and password there to generate the setup QR.</li>"
    "<li>Keep this phone connected to the AscultiCor-Setup Wi-Fi, open its normal Camera app, and scan that QR.</li>"
    "</ol>The QR returns this phone to the ESP32 and securely fills the setup automatically.</div>"
    "<p class='note'>If your phone's captive-network window prevents switching to Camera, close that window first. "
    "Stay connected to the ESP32 Wi-Fi, scan the QR, and accept opening <b>192.168.4.1</b>.</p>");
  if (message.length()) page += "<p class='msg'>" + htmlEscape(message) + "</p>";
  page += F(
    "<div class='fallback'><strong>Manual fallback</strong>"
    "<form method='post' action='/save'>"
    "<label>Wi-Fi name</label><input name='ssid' required maxlength='63'>"
    "<label>Wi-Fi password</label><input name='pass' type='password' maxlength='63'>"
    "<label>Device ID</label><input name='device_id' required maxlength='36'>"
    "<label>Device secret</label><input name='device_secret' type='password' required maxlength='79'>"
    "<label>Bootstrap URL</label><input name='bootstrap_url' required maxlength='191' placeholder='https://example.com/api/device/bootstrap'>"
    "<label><input style='width:auto' name='insecure' type='checkbox' value='1'> Development only: allow insecure HTTPS</label>"
    "<button type='submit'>Save and connect</button></form></div></div></body></html>");
  return page;
}

bool saveProvisioningValues(
  const String &ssid,
  const String &pass,
  const String &newDeviceId,
  const String &newSecret,
  const String &newBootstrap,
  bool insecure,
  String &error
) {
  if (!ssid.length() || newDeviceId.length() != 36 || !newSecret.length() || !newBootstrap.length()) {
    error = "Please complete Wi-Fi name, device ID, device secret, and bootstrap URL.";
    return false;
  }

  saveCredential("wifi_ssid", ssid.c_str());
  saveCredential("wifi_pass", pass.c_str());
  saveCredential("device_id", newDeviceId.c_str());
  saveCredential("device_secret", newSecret.c_str());
  saveCredential("bootstrap_url", newBootstrap.c_str());
  saveCredential("bootstrap_insecure", insecure ? "true" : "false");
  return true;
}

bool saveProvisioningPayload(const String &payload, String &error) {
  StaticJsonDocument<1536> doc;
  DeserializationError jsonError = deserializeJson(doc, payload);
  if (jsonError) {
    error = String("QR payload was not valid JSON: ") + jsonError.c_str();
    return false;
  }

  const char *type = doc["type"] | "";
  if (strcmp(type, "asculticor-provision-v2") != 0 && strcmp(type, "asculticor-wifi-setup-v2") != 0) {
    error = "Unsupported QR payload type.";
    return false;
  }

  String ssid = doc["wifi_ssid"] | "";
  String pass = doc["wifi_pass"] | "";
  String newDeviceId = doc["device_id"] | "";
  String newSecret = doc["device_secret"] | "";
  String newBootstrap = doc["bootstrap_url"] | "";
  bool insecure = doc["bootstrap_insecure"] | false;

  return saveProvisioningValues(ssid, pass, newDeviceId, newSecret, newBootstrap, insecure, error);
}

void stopProvisioningPortal() {
  if (!provisioningPortalActive) return;
  provisioningDns.stop();
  provisioningServer.stop();
  WiFi.softAPdisconnect(true);
  provisioningPortalActive = false;
}

void startProvisioningPortal() {
  if (provisioningPortalActive) return;

  uint64_t chip = ESP.getEfuseMac();
  char apName[32];
  snprintf(apName, sizeof(apName), "%s%04X", PROVISIONING_AP_PREFIX, (uint16_t)(chip & 0xFFFF));

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apName);
  provisioningDns.start(53, "*", WiFi.softAPIP());

  provisioningServer.on("/", HTTP_GET, []() {
    provisioningServer.send(200, "text/html", provisioningPage());
  });
  provisioningServer.on("/provision", HTTP_GET, []() {
    if (!provisioningServer.hasArg("payload")) {
      provisioningServer.send(400, "text/html", provisioningPage("QR payload is missing."));
      return;
    }

    String error;
    if (!saveProvisioningPayload(provisioningServer.arg("payload"), error)) {
      provisioningServer.send(400, "text/html", provisioningPage(error));
      return;
    }

    provisioningServer.send(200, "text/html",
      provisioningPage("QR setup saved. The ESP32 will restart and connect to AscultiCor."));
    delay(1200);
    ESP.restart();
  });
  provisioningServer.on("/save", HTTP_POST, []() {
    String ssid = provisioningServer.arg("ssid");
    String pass = provisioningServer.arg("pass");
    String newDeviceId = provisioningServer.arg("device_id");
    String newSecret = provisioningServer.arg("device_secret");
    String newBootstrap = provisioningServer.arg("bootstrap_url");

    String error;
    if (!saveProvisioningValues(
      ssid,
      pass,
      newDeviceId,
      newSecret,
      newBootstrap,
      provisioningServer.hasArg("insecure"),
      error
    )) {
      provisioningServer.send(400, "text/html", provisioningPage(error));
      return;
    }

    provisioningServer.send(200, "text/html",
      provisioningPage("Configuration saved. The ESP32 will restart and connect to your Wi-Fi."));
    delay(1200);
    ESP.restart();
  });
  provisioningServer.onNotFound([]() {
    provisioningServer.sendHeader("Location", "/", true);
    provisioningServer.send(302, "text/plain", "");
  });
  provisioningServer.begin();
  provisioningPortalActive = true;

  Serial.printf("[PROVISION] Wi-Fi setup portal started: %s\n", apName);
  Serial.printf("[PROVISION] Connect to it and open http://%s/\n", WiFi.softAPIP().toString().c_str());
}

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
    startProvisioningPortal();
  }
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  if (provisioningPortalActive && !wifiCredentialsProvisioned()) return false;

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

void resetEcgSampleQueue() {
  portENTER_CRITICAL(&ecgQueueMux);
  ecgQueueHead = 0;
  ecgQueueTail = 0;
  ecgQueueCount = 0;
  ecgDroppedSamples = 0;
  portEXIT_CRITICAL(&ecgQueueMux);
}

bool hasQueuedEcgSamples() {
  portENTER_CRITICAL(&ecgQueueMux);
  bool available = ecgQueueCount > 0;
  portEXIT_CRITICAL(&ecgQueueMux);
  return available;
}

bool popEcgSample(int16_t *sample) {
  if (!sample) return false;

  bool available = false;
  portENTER_CRITICAL(&ecgQueueMux);
  if (ecgQueueCount > 0) {
    *sample = ecgSampleQueue[ecgQueueHead];
    ecgQueueHead = (ecgQueueHead + 1) % ECG_QUEUE_SAMPLES;
    ecgQueueCount--;
    available = true;
  }
  portEXIT_CRITICAL(&ecgQueueMux);
  return available;
}

void ecgSamplingTask(void *parameter) {
  const TickType_t intervalTicks = pdMS_TO_TICKS(1000 / ECG_SAMPLE_RATE);
  TickType_t nextWake = xTaskGetTickCount();

  for (;;) {
    vTaskDelayUntil(&nextWake, intervalTicks);
    if (!isStreaming) continue;

    int16_t sample = readEcgSample();
    portENTER_CRITICAL(&ecgQueueMux);
    if (ecgQueueCount < ECG_QUEUE_SAMPLES) {
      ecgSampleQueue[ecgQueueTail] = sample;
      ecgQueueTail = (ecgQueueTail + 1) % ECG_QUEUE_SAMPLES;
      ecgQueueCount++;
    } else {
      ecgDroppedSamples++;
    }
    portEXIT_CRITICAL(&ecgQueueMux);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ECG SAMPLING TASK + PCG HARDWARE TIMER
// ═══════════════════════════════════════════════════════════════

void setupEcgSamplingTask() {
  BaseType_t created = xTaskCreatePinnedToCore(
    ecgSamplingTask,
    "ecg-sampler",
    4096,
    nullptr,
    3,
    &ecgSamplingTaskHandle,
    1
  );
  if (created != pdPASS) {
    Serial.println("[ECG] ERROR: Could not start 500 Hz sampling task");
    return;
  }
  Serial.println("[ECG] Dedicated sampling task started: 500 Hz, 1024-sample queue");
}

// --- PCG Timer ISR (22050 Hz) ---
//   Reads MAX9814 analog output directly in the ISR.
//   analogRead() takes ~10 µs on ESP32 — well within the 45 µs period.
void IRAM_ATTR onPcgTimerISR() {
  if (!isStreaming || !pcgCaptureEnabled) return;

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
void publishFirmwareEvent(const char *state, const char *targetVersion, const char *detail) {
  if (!mqtt.connected()) return;
  char topic[160];
  buildTopic(topic, sizeof(topic), "firmware");

  StaticJsonDocument<512> doc;
  doc["state"] = state;
  doc["device_id"] = device_id;
  doc["current_version"] = FIRMWARE_VERSION;
  doc["target_version"] = targetVersion ? targetVersion : "";
  doc["detail"] = detail ? detail : "";
  doc["free_heap"] = ESP.getFreeHeap();

  char payload[640];
  size_t length = serializeJson(doc, payload, sizeof(payload));
  mqtt.publish(topic, reinterpret_cast<const uint8_t *>(payload), length, false);
}

String sha256Hex(const unsigned char digest[32]) {
  static const char hex[] = "0123456789abcdef";
  char output[65];
  for (int i = 0; i < 32; i++) {
    output[i * 2] = hex[(digest[i] >> 4) & 0x0F];
    output[i * 2 + 1] = hex[digest[i] & 0x0F];
  }
  output[64] = '\0';
  return String(output);
}

bool installFirmwareUpdate(const char *url, const char *expectedSha256, const char *targetVersion) {
  if (otaInProgress || isStreaming || !url || !expectedSha256 || strlen(expectedSha256) != 64) {
    publishFirmwareEvent("rejected", targetVersion, isStreaming ? "recording_in_progress" : "invalid_update_request");
    return false;
  }

  otaInProgress = true;
  publishFirmwareEvent("downloading", targetVersion, "starting_https_download");

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  bool isHttps = strncmp(url, "https://", 8) == 0;

  if (isHttps) {
    if (strlen(bootstrap_ca_pem) > 0) {
      String caPem = normalizedBootstrapCaPem();
      secureClient.setCACert(caPem.c_str());
    } else if (bootstrap_insecure) {
      secureClient.setInsecure();
    } else {
      publishFirmwareEvent("failed", targetVersion, "https_ca_not_configured");
      otaInProgress = false;
      return false;
    }
    if (!http.begin(secureClient, url)) {
      publishFirmwareEvent("failed", targetVersion, "https_initialization_failed");
      otaInProgress = false;
      return false;
    }
  } else if (!http.begin(plainClient, url)) {
    publishFirmwareEvent("failed", targetVersion, "http_initialization_failed");
    otaInProgress = false;
    return false;
  }

  http.setTimeout(15000);
  int status = http.GET();
  int contentLength = http.getSize();
  if (status != HTTP_CODE_OK || contentLength <= 0) {
    char detail[96];
    snprintf(detail, sizeof(detail), "download_failed_http_%d_length_%d", status, contentLength);
    publishFirmwareEvent("failed", targetVersion, detail);
    http.end();
    otaInProgress = false;
    return false;
  }

  if (!Update.begin((size_t)contentLength, U_FLASH)) {
    publishFirmwareEvent("failed", targetVersion, "ota_partition_unavailable_or_image_too_large");
    http.end();
    otaInProgress = false;
    return false;
  }

  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts(&sha, 0);

  WiFiClient *stream = http.getStreamPtr();
  uint8_t buffer[1024];
  size_t written = 0;
  unsigned long lastProgress = 0;

  while (http.connected() && written < (size_t)contentLength) {
    size_t available = stream->available();
    if (!available) {
      delay(2);
      continue;
    }
    size_t readLength = stream->readBytes(buffer, min(available, sizeof(buffer)));
    if (!readLength) continue;

    mbedtls_sha256_update(&sha, buffer, readLength);
    if (Update.write(buffer, readLength) != readLength) {
      Update.abort();
      mbedtls_sha256_free(&sha);
      http.end();
      publishFirmwareEvent("failed", targetVersion, "flash_write_failed");
      otaInProgress = false;
      return false;
    }
    written += readLength;

    if (millis() - lastProgress > 2000) {
      lastProgress = millis();
      char detail[64];
      snprintf(detail, sizeof(detail), "downloaded_%u_of_%u_bytes", (unsigned)written, (unsigned)contentLength);
      publishFirmwareEvent("installing", targetVersion, detail);
      mqtt.loop();
    }
  }

  unsigned char digest[32];
  mbedtls_sha256_finish(&sha, digest);
  mbedtls_sha256_free(&sha);
  http.end();

  String actualSha256 = sha256Hex(digest);
  if (written != (size_t)contentLength || !actualSha256.equalsIgnoreCase(expectedSha256)) {
    Update.abort();
    publishFirmwareEvent("failed", targetVersion, "sha256_verification_failed");
    otaInProgress = false;
    return false;
  }

  if (!Update.end(true) || !Update.isFinished()) {
    publishFirmwareEvent("failed", targetVersion, "ota_finalize_failed");
    otaInProgress = false;
    return false;
  }

  publishFirmwareEvent("rebooting", targetVersion, "verified_update_installed");
  delay(750);
  ESP.restart();
  return true;
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  // Parse incoming control messages
  StaticJsonDocument<1024> doc;
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
  } else if (strcmp(command, "firmware_update") == 0) {
    const char *url = doc["url"];
    const char *sha256 = doc["sha256"];
    const char *version = doc["version"];
    installFirmwareUpdate(url, sha256, version);
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
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["mode"] = "real_hardware";
  doc["wifi"] = WiFi.isConnected() ? "connected" : "disconnected";
  doc["mqtt"] = mqtt.connected() ? "connected" : "disconnected";
  doc["free_heap"] = ESP.getFreeHeap();
  doc["mic_type"] = "MAX9814";
  doc["default_session_duration_sec"] = defaultSessionDurationSec;
  doc["quality_gate_enabled"] = true;
  doc["streaming"] = isStreaming;
  doc["ota_capable"] = true;
  doc["ota_in_progress"] = otaInProgress;

  char buf[384];
  size_t payloadLen = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(statusTopic, reinterpret_cast<const uint8_t *>(buf), payloadLen, true);
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
    doc["sample_rate_hz"]     = PCG_ACTUAL_SAMPLE_RATE;  // 22222 Hz — actual hardware timer rate
    doc["format"]             = "pcm_s16le";
    doc["channels"]           = 1;
    doc["chunk_samples"]      = PCG_CHUNK_SAMPLES;
    doc["target_duration_sec"] = activeSessionDurationSec;
    doc["microphone"]         = "MAX9814";
    doc["gain_db"]            = 60;
  } else if (strcmp(type, "start_ecg") == 0) {
    doc["sample_rate_hz"]      = ECG_SAMPLE_RATE;
    doc["format"]              = "int16_mv";
    doc["lead"]                = "MLII";
    doc["n_leads"]             = 1;             // single-lead � AD8232, 3-electrode PCB
    doc["chunk_samples"]       = ECG_BUFFER_SIZE;
    doc["adc_resolution"]      = 12;
    doc["target_duration_sec"] = activeSessionDurationSec;
    // Inference model meta � used for logging/compatibility check on the server.
    // AuscultICor v26 SL is single-lead compatible; no hardware changes needed.
    // RR-interval features are computed SERVER-SIDE from the raw ECG stream.
    doc["ecg_model"]           = "AuscultICor_v26_SL";
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
  doc["pcg_capture_enabled"] = report.pcg_signal_present && !report.pcg_clipping_detected;
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
  doc["ecg_dropped_samples"] = ecgDroppedSamples;
  doc["pcg_dropped_buffers"] = pcgDroppedBuffers;

  char buf[256];
  size_t payloadLen = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topic, reinterpret_cast<const uint8_t *>(buf), payloadLen, false);
}

// ═══════════════════════════════════════════════════════════════
//  PCG STREAMING (timer-driven, send from main loop)
// ═══════════════════════════════════════════════════════════════
void processPcgBuffer() {
  if (!mqtt.connected() || !pcgCaptureEnabled) return;

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
//
//  Model compatibility note — AuscultICor v26 SL:
//  ─────────────────────────────────────────────────────────────
//  The inference server accepts the raw single-lead int16 ECG stream
//  as published here (500 Hz, MLII lead, AD8232). It performs:
//    1. Resampling: 500 Hz  ->  125 Hz  (model training rate)
//    2. Bandpass filter: 0.5 - 50 Hz
//    3. Windowing: 500-sample overlapping beat windows
//    4. RR feature extraction: 9 HRV statistics estimated from
//       R-peak detection on the server -- NO firmware changes needed.
//  No additional channels, no hardware modifications required.
void processEcgSample() {
  int drained = 0;
  int16_t sample = 0;

  while (drained < ECG_DRAIN_BATCH && popEcgSample(&sample)) {
    ecgBuffer[ecgBufferIdx++] = sample;
    drained++;

    // Send each complete one-second block while the acquisition task keeps
    // filling the independent ring buffer.
    if (ecgBufferIdx >= ECG_BUFFER_SIZE) {
      char topic[160];
      buildSessionTopic(topic, sizeof(topic), "ecg");

      size_t payloadBytes = ECG_BUFFER_SIZE * sizeof(int16_t);
      if (payloadBytes <= MQTT_BUFFER_BYTES) {
        if (!mqtt.publish(topic, (byte *)ecgBuffer, payloadBytes, false)) {
          Serial.println("[ECG] WARNING: MQTT publish failed for full chunk");
        }
      } else {
        Serial.println("[ECG] WARNING: buffer exceeds MQTT limit!");
      }

      ecgBufferIdx = 0;
    }
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
  resetEcgSampleQueue();
  resetPcgBufferQueue();
  pcgCaptureEnabled = false;
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
  pcgCaptureEnabled =
    preflightReport.pcg_signal_present &&
    !preflightReport.pcg_clipping_detected;

  if (pcgCaptureEnabled) {
    publishSessionMeta("start_pcg");
    delay(150);
  } else {
    Serial.printf(
      "[SESSION] PCG unavailable; continuing in ECG-only mode: %s\n",
      preflightReport.reason
    );
  }
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

  // Allow an in-flight 2 ms sample to enter the queue, then drain every
  // acquired ECG sample before publishing the final partial block.
  delay(3);
  while (hasQueuedEcgSamples()) {
    processEcgSample();
  }

  if (pcgCaptureEnabled) {
    flushPendingPcgBuffers(250);
    flushPartialPcgBuffer();
  }
  flushPartialEcgBuffer();
  delay(50);

  if (pcgCaptureEnabled) {
    publishSessionMeta("end_pcg");
    delay(100);
  }
  publishSessionMeta("end_ecg");
  pcgCaptureEnabled = false;
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

  // A factory-fresh board has no usable network or device identity. Open the
  // setup AP immediately instead of wasting 20 seconds on placeholder values.
  if (!wifiCredentialsProvisioned() || !deviceIdentityProvisioned()) {
    startProvisioningPortal();
  } else {
    setupWiFi();
  }

  if (shouldUseBootstrap() && WiFi.status() == WL_CONNECTED) {
    if (!fetchBootstrapConfig()) {
      Serial.println("[BOOTSTRAP] Falling back to locally stored MQTT credentials");
    }
  }

  // MQTT
  if (!configureMqttTransport()) {
    Serial.println("[MQTT] Transport setup deferred until the next reconnect attempt");
  }
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(MQTT_BUFFER_BYTES);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_SEC);

  // Dedicated real-time task for ECG sampling (500 Hz)
  setupEcgSamplingTask();

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

  if (provisioningPortalActive) {
    provisioningDns.processNextRequest();
    provisioningServer.handleClient();
  }

  // ── Serial provisioning ──
  handleSerialProvisioning();

  // ── LED feedback ──
  updateLed();

  // ── WiFi health check ──
  if (!ensureWiFi()) {
    delay(100);
    return;  // Skip everything until WiFi is back
  }

  if (provisioningPortalActive && deviceIdentityProvisioned()) {
    stopProvisioningPortal();
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
