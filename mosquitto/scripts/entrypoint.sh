#!/bin/sh
set -eu

MQTT_USERNAME="${MQTT_USERNAME:-}"
MQTT_PASSWORD="${MQTT_PASSWORD:-}"
MQTT_SYNC_INTERVAL_SEC="${MQTT_SYNC_INTERVAL_SEC:-15}"
SYNC_STATUS_FILE="/tmp/mqtt-sync.status"
RUNTIME_CONFIG="/tmp/mosquitto.conf"
TLS_CERT_SOURCE="/mosquitto/certs/fullchain.pem"
TLS_KEY_SOURCE="/mosquitto/certs/privkey.pem"
TLS_CERT="/tmp/mosquitto-certs/fullchain.pem"
TLS_KEY="/tmp/mosquitto-certs/privkey.pem"

if [ -z "$MQTT_USERNAME" ] || [ -z "$MQTT_PASSWORD" ]; then
  echo "ERROR: MQTT_USERNAME and MQTT_PASSWORD must be set." >&2
  exit 1
fi

sync_credentials() {
  python3 /usr/local/bin/sync_device_credentials.py --status-file "$SYNC_STATUS_FILE"

  if [ -n "${MOSQUITTO_PID:-}" ] && [ -f "$SYNC_STATUS_FILE" ] && [ "$(cat "$SYNC_STATUS_FILE")" = "changed" ]; then
    echo "[mqtt-sync] Configuration changed, reloading Mosquitto"
    kill -HUP "$MOSQUITTO_PID"
  fi
}

sync_credentials

cp /mosquitto/config/mosquitto.conf "$RUNTIME_CONFIG"

if [ -r "$TLS_CERT_SOURCE" ] && [ -r "$TLS_KEY_SOURCE" ]; then
  install -d -m 0750 -o mosquitto -g mosquitto /tmp/mosquitto-certs
  install -m 0644 -o mosquitto -g mosquitto "$TLS_CERT_SOURCE" "$TLS_CERT"
  install -m 0640 -o mosquitto -g mosquitto "$TLS_KEY_SOURCE" "$TLS_KEY"
  cat >> "$RUNTIME_CONFIG" <<EOF

listener 8883
protocol mqtt
certfile $TLS_CERT
keyfile $TLS_KEY
tls_version tlsv1.2
EOF
  echo "[mqtt-tls] Enabled authenticated MQTT over TLS on port 8883"
else
  echo "[mqtt-tls] Certificate files not mounted; TLS listener is disabled"
fi

/usr/sbin/mosquitto -c "$RUNTIME_CONFIG" &
MOSQUITTO_PID="$!"

cleanup() {
  kill -TERM "$MOSQUITTO_PID" 2>/dev/null || true
  if [ -n "${SYNC_LOOP_PID:-}" ]; then
    kill -TERM "$SYNC_LOOP_PID" 2>/dev/null || true
  fi
  wait "$MOSQUITTO_PID" 2>/dev/null || true
}

trap cleanup INT TERM

(
  while true; do
    sleep "$MQTT_SYNC_INTERVAL_SEC"
    sync_credentials
  done
) &
SYNC_LOOP_PID="$!"

wait "$MOSQUITTO_PID"
