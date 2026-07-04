import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { deriveDeviceMqttPassword } from '../../../../lib/mqttCredentials'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BOOTSTRAP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const BOOTSTRAP_RATE_LIMIT_MAX = 120
const bootstrapAttempts = new Map<string, number[]>()

function isMissingMqttCredentialColumns(error: unknown) {
  const message = JSON.stringify(error ?? '').toLowerCase()
  return message.includes('mqtt_username') || message.includes('mqtt_password_hash')
}

function clientKey(request: Request, deviceId: string) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  return `${forwardedFor || realIp || 'unknown'}:${deviceId || 'unknown'}`
}

function isRateLimited(key: string) {
  const now = Date.now()
  const since = now - BOOTSTRAP_RATE_LIMIT_WINDOW_MS
  const attempts = (bootstrapAttempts.get(key) || []).filter((time) => time > since)
  attempts.push(now)
  bootstrapAttempts.set(key, attempts)
  return attempts.length > BOOTSTRAP_RATE_LIMIT_MAX
}

function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')

  if (host) {
    return `${forwardedProto || requestUrl.protocol.replace(':', '')}://${host}`
  }

  return requestUrl.origin
}

function getBootstrapBaseUrl(request: Request) {
  const configured = (
    process.env.DEVICE_BOOTSTRAP_URL ||
    process.env.NEXT_PUBLIC_DEVICE_BOOTSTRAP_URL ||
    process.env.DEVICE_BOOTSTRAP_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL
  )?.trim()
  if (configured) {
    return configured.replace(/\/api\/device\/bootstrap$/, '').replace(/\/$/, '')
  }

  return getRequestOrigin(request)
}

function stripPort(host: string) {
  return host.replace(/:\d+$/, '')
}

function isLoopbackHost(host: string) {
  const normalized = stripPort(host).toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const deviceId = body?.device_id?.trim()
    const deviceSecret = body?.device_secret?.trim()

    if (!deviceId || !deviceSecret) {
      return NextResponse.json(
        { status: 'error', code: 'MALFORMED_REQUEST', message: 'device_id and device_secret are required' },
        { status: 400 }
      )
    }

    if (!UUID_RE.test(deviceId)) {
      return NextResponse.json({ status: 'error', code: 'INVALID_DEVICE_SECRET', message: 'Device authentication failed' }, { status: 401 })
    }

    if (isRateLimited(clientKey(request, deviceId))) {
      return NextResponse.json(
        { status: 'error', code: 'RATE_LIMITED', message: 'Too many bootstrap attempts. Try again later.' },
        { status: 429 }
      )
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { status: 'error', code: 'SERVER_MISCONFIGURED', message: 'Device bootstrap is unavailable.' },
        { status: 500 }
      )
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    let deviceResponse = await serviceClient
      .from('devices')
      .select('id, org_id, device_name, device_secret_hash, mqtt_username, mqtt_password_hash')
      .eq('id', deviceId)
      .single()

    if (deviceResponse.error && isMissingMqttCredentialColumns(deviceResponse.error)) {
      deviceResponse = await serviceClient
        .from('devices')
        .select('id, org_id, device_name, device_secret_hash')
        .eq('id', deviceId)
        .single()
    }

    const { data: device, error: deviceError } = deviceResponse

    if (deviceError || !device) {
      return NextResponse.json({ status: 'error', code: 'INVALID_DEVICE_SECRET', message: 'Device authentication failed' }, { status: 401 })
    }

    const validSecret = await bcrypt.compare(deviceSecret, device.device_secret_hash)
    if (!validSecret) {
      return NextResponse.json({ status: 'error', code: 'INVALID_DEVICE_SECRET', message: 'Device authentication failed' }, { status: 401 })
    }

    const usesPerDeviceMqtt = Boolean(device.mqtt_username && device.mqtt_password_hash)
    const fallbackMqttUser = process.env.MQTT_USERNAME
    const fallbackMqttPass = process.env.MQTT_PASSWORD
    const mqttUser = usesPerDeviceMqtt ? device.mqtt_username : fallbackMqttUser
    const mqttPass = usesPerDeviceMqtt
      ? deriveDeviceMqttPassword(device.id, deviceSecret)
      : fallbackMqttPass

    if (!mqttUser || !mqttPass) {
      return NextResponse.json(
        { status: 'error', code: 'MQTT_CREDENTIALS_UNAVAILABLE', message: 'Broker credentials are unavailable for this device.' },
        { status: 500 }
      )
    }

    const bootstrapBaseUrl = getBootstrapBaseUrl(request)
    const bootstrapUrl = `${bootstrapBaseUrl}/api/device/bootstrap`
    const bootstrapHost = new URL(bootstrapBaseUrl).host
    const mqttHost =
      process.env.MQTT_PUBLIC_HOST?.trim() ||
      process.env.NEXT_PUBLIC_MQTT_PUBLIC_HOST?.trim() ||
      process.env.DEVICE_BOOTSTRAP_MQTT_HOST?.trim() ||
      stripPort(new URL(bootstrapBaseUrl).host)
    const mqttPort = Number(
      process.env.MQTT_PUBLIC_PORT ||
      process.env.NEXT_PUBLIC_MQTT_PUBLIC_PORT ||
      process.env.DEVICE_BOOTSTRAP_MQTT_PORT ||
      1883
    )
    const mqttTls = parseBoolean(
      process.env.MQTT_PUBLIC_USE_TLS ||
      process.env.NEXT_PUBLIC_MQTT_USE_TLS ||
      process.env.DEVICE_BOOTSTRAP_MQTT_TLS,
      false
    )
    const mqttLanExposureEnabled = !isLoopbackHost(
      process.env.MQTT_BIND_ADDRESS || '127.0.0.1'
    )

    await serviceClient.from('audit_logs').insert({
      org_id: device.org_id,
      user_id: null,
      action: 'device_bootstrap_requested',
      entity_type: 'device',
      entity_id: device.id,
      metadata: {
        bootstrap_url: bootstrapUrl,
        mqtt_host: mqttHost,
        mqtt_port: mqttPort,
        mqtt_tls: mqttTls,
        mqtt_scope: usesPerDeviceMqtt ? 'device_scoped' : 'legacy_shared',
      },
    })

    return NextResponse.json({
      status: 'ok',
      device_id: device.id,
      org_id: device.org_id,
      mqtt_host: mqttHost,
      mqtt_port: mqttPort,
      mqtt_user: mqttUser,
      mqtt_pass: mqttPass,
      mqtt_tls: mqttTls,
      bootstrap_url: bootstrapUrl,
    })
  } catch (error) {
    console.error('Error bootstrapping device credentials:', error)
    return NextResponse.json(
      { status: 'error', code: 'BOOTSTRAP_FAILED', message: 'Failed to bootstrap device credentials' },
      { status: 500 }
    )
  }
}
