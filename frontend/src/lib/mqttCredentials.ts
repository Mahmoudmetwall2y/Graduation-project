import 'server-only'

import { createHmac, pbkdf2Sync, randomBytes } from 'crypto'

const MOSQUITTO_HASH_ITERATIONS = 101
const MOSQUITTO_HASH_BYTES = 64

function getDevicePasswordPepper() {
  const pepper = process.env.MQTT_DEVICE_PASSWORD_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pepper) {
    throw new Error('MQTT_DEVICE_PASSWORD_PEPPER or SUPABASE_SERVICE_ROLE_KEY is required for device MQTT credentials')
  }
  return pepper
}

export function buildDeviceMqttUsername(deviceId: string) {
  return `device_${deviceId.replace(/-/g, '')}`
}

export function deriveDeviceMqttPassword(deviceId: string, deviceSecret: string) {
  const digest = createHmac('sha256', getDevicePasswordPepper())
    .update(`${deviceId}:${deviceSecret}`)
    .digest('base64url')

  return digest.slice(0, 48)
}

export function createMosquittoPasswordHash(password: string, salt = randomBytes(12)) {
  const derivedKey = pbkdf2Sync(
    password,
    salt,
    MOSQUITTO_HASH_ITERATIONS,
    MOSQUITTO_HASH_BYTES,
    'sha512'
  )

  return `$7$${MOSQUITTO_HASH_ITERATIONS}$${salt.toString('base64').replace(/=+$/g, '')}$${derivedKey.toString('base64')}`
}

export function buildDeviceMqttCredentials(deviceId: string, deviceSecret: string) {
  const mqttUsername = buildDeviceMqttUsername(deviceId)
  const mqttPassword = deriveDeviceMqttPassword(deviceId, deviceSecret)

  return {
    mqttUsername,
    mqttPassword,
    mqttPasswordHash: createMosquittoPasswordHash(mqttPassword),
  }
}
