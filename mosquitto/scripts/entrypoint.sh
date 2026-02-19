#!/bin/sh
set -eu

MQTT_USERNAME="${MQTT_USERNAME:-}"
MQTT_PASSWORD="${MQTT_PASSWORD:-}"

if [ -z "$MQTT_USERNAME" ] || [ -z "$MQTT_PASSWORD" ]; then
  echo "ERROR: MQTT_USERNAME and MQTT_PASSWORD must be set." >&2
  exit 1
fi

mosquitto_passwd -b -c /mosquitto/config/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
chmod 0700 /mosquitto/config/passwd
chown mosquitto:mosquitto /mosquitto/config/passwd

exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
