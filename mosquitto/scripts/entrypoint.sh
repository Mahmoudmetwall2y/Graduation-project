#!/bin/sh
set -eu

MQTT_USERNAME="${MQTT_USERNAME:-}"
MQTT_PASSWORD="${MQTT_PASSWORD:-}"
MQTT_SYNC_INTERVAL_SEC="${MQTT_SYNC_INTERVAL_SEC:-15}"
SYNC_STATUS_FILE="/tmp/mqtt-sync.status"

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

/usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf &
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
