import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { buildDeviceMqttCredentials } from '../../../lib/mqttCredentials'

const DEVICE_OFFLINE_THRESHOLD_MS = 90 * 1000

function isMissingMqttCredentialColumns(error: unknown) {
  const message = JSON.stringify(error ?? '').toLowerCase()
  return message.includes('mqtt_username') || message.includes('mqtt_password_hash')
}

function normalizeDeviceRuntimeStatus<T extends { status?: string | null; last_seen_at?: string | null }>(
  device: T
): T {
  if (!device) return device

  const rawStatus = device.status || 'offline'
  if (rawStatus === 'error' || rawStatus === 'offline') {
    return { ...device, status: rawStatus }
  }

  if (!device.last_seen_at) {
    return { ...device, status: 'offline' }
  }

  const lastSeenAt = new Date(device.last_seen_at).getTime()
  if (!Number.isFinite(lastSeenAt)) {
    return { ...device, status: 'offline' }
  }

  const isFresh = Date.now() - lastSeenAt <= DEVICE_OFFLINE_THRESHOLD_MS
  return {
    ...device,
    status: isFresh ? 'online' : 'offline'
  }
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
  const configured = process.env.DEVICE_BOOTSTRAP_PUBLIC_BASE_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
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

// GET /api/devices - List all devices
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org_id and role
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch devices with groups and stats
    const { data: devices, error } = await supabase
      .from('devices')
      .select(`
        *,
        device_groups(name),
        sessions: sessions(count)
      `)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      devices: (devices || []).map(normalizeDeviceRuntimeStatus),
      current_user_role: profile.role,
      can_create_devices: profile.role === 'admin'
    })
  } catch (error: any) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500 }
    )
  }
}

// POST /api/devices - Create new device
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const body = await request.json()

    const { device_name, device_type = 'esp32', device_group_id, notes, sensor_config } = body

    if (!device_name) {
      return NextResponse.json(
        { error: 'Device name is required' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org_id and role
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only admins can create and provision devices' },
        { status: 403 }
      )
    }

    // Generate device credentials
    const deviceId = randomUUID()
    const deviceSecret = `asc_${randomUUID().replace(/-/g, '')}`
    const deviceSecretHash = await bcrypt.hash(deviceSecret, 12)
    const {
      mqttUsername,
      mqttPassword,
      mqttPasswordHash,
    } = buildDeviceMqttCredentials(deviceId, deviceSecret)
    const sharedMqttUser = process.env.MQTT_USERNAME
    const sharedMqttPass = process.env.MQTT_PASSWORD
    let usesPerDeviceMqtt = true

    // Create device
    let device: any = null
    let deviceInsert = await supabase
      .from('devices')
      .insert({
        id: deviceId,
        org_id: profile.org_id,
        owner_user_id: user.id,
        device_name,
        device_type,
        device_group_id: device_group_id || null,
        device_secret_hash: deviceSecretHash,
        mqtt_username: mqttUsername,
        mqtt_password_hash: mqttPasswordHash,
        notes: notes || null,
        sensor_config: sensor_config || {},
        status: 'offline'
      })
      .select()
      .single()

    if (deviceInsert.error && isMissingMqttCredentialColumns(deviceInsert.error)) {
      usesPerDeviceMqtt = false
      deviceInsert = await supabase
        .from('devices')
        .insert({
          id: deviceId,
          org_id: profile.org_id,
          owner_user_id: user.id,
          device_name,
          device_type,
          device_group_id: device_group_id || null,
          device_secret_hash: deviceSecretHash,
          notes: notes || null,
          sensor_config: sensor_config || {},
          status: 'offline'
        })
        .select()
        .single()
    }

    if (deviceInsert.error) throw deviceInsert.error
    device = deviceInsert.data

    if (!usesPerDeviceMqtt && (!sharedMqttUser || !sharedMqttPass)) {
      return NextResponse.json(
        { error: 'Server misconfiguration: legacy MQTT credentials are required until migration 024 is applied.' },
        { status: 500 }
      )
    }

    // Create audit log
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        action: 'device_created',
        entity_type: 'device',
        entity_id: deviceId,
        metadata: { device_name, device_type }
      })
    if (auditError) console.error('Audit log failed (device_created):', auditError)

    const bootstrapBaseUrl = getBootstrapBaseUrl(request)
    const bootstrapUrl = `${bootstrapBaseUrl}/api/device/bootstrap`
    const bootstrapHost = new URL(bootstrapBaseUrl).host
    const mqttHost =
      process.env.DEVICE_BOOTSTRAP_MQTT_HOST?.trim() || stripPort(new URL(bootstrapBaseUrl).host)
    const mqttPort = Number(process.env.DEVICE_BOOTSTRAP_MQTT_PORT || 1883)
    const mqttTls = parseBoolean(process.env.DEVICE_BOOTSTRAP_MQTT_TLS, false)
    const mqttLanExposureEnabled = !isLoopbackHost(
      process.env.MQTT_BIND_ADDRESS || '127.0.0.1'
    )

    return NextResponse.json({
      device,
      credentials: {
        device_id: deviceId,
        device_secret: deviceSecret, // Show only once!
        org_id: profile.org_id,
        bootstrap_url: bootstrapUrl,
        bootstrap_requires_host_override: isLoopbackHost(bootstrapHost),
        provisioning_mode: 'bootstrap_recommended',
        mqtt_host: mqttHost,
        mqtt_port: mqttPort,
        mqtt_tls: mqttTls,
        mqtt_lan_exposure_enabled: mqttLanExposureEnabled,
        mqtt_user: usesPerDeviceMqtt ? mqttUsername : sharedMqttUser!,
        mqtt_pass: usesPerDeviceMqtt ? mqttPassword : sharedMqttPass!
      }
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating device:', error)
    return NextResponse.json(
      { error: 'Failed to create device' },
      { status: 500 }
    )
  }
}
