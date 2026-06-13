import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import mqtt from 'mqtt'

const START_ACK_TIMEOUT_MS = 15000
const START_ACK_POLL_MS = 250
const DEFAULT_CAPTURE_DURATION_SEC = 15
const MIN_CAPTURE_DURATION_SEC = 8
const MAX_CAPTURE_DURATION_SEC = 60
const DEVICE_START_FRESH_MS = 90 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizeCaptureDuration(rawValue: string | undefined) {
  const parsed = Number(rawValue ?? DEFAULT_CAPTURE_DURATION_SEC)
  if (!Number.isFinite(parsed)) return DEFAULT_CAPTURE_DURATION_SEC
  if (parsed < MIN_CAPTURE_DURATION_SEC) return MIN_CAPTURE_DURATION_SEC
  if (parsed > MAX_CAPTURE_DURATION_SEC) return MAX_CAPTURE_DURATION_SEC
  return Math.round(parsed)
}

function createServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function buildMqttUrl(hostValue: string, portValue: string | undefined, useTls: boolean) {
  const scheme = useTls ? 'mqtts' : 'mqtt'
  const normalizedHost = hostValue
    .trim()
    .replace(/^mqtts?:\/\//i, '')
    .replace(/\/.*$/, '')
  const port = Number(portValue || 1883)
  const hasPort = /:\d+$/.test(normalizedHost)

  return `${scheme}://${normalizedHost}${hasPort ? '' : `:${Number.isFinite(port) ? port : 1883}`}`
}

function getStartCommandBrokerUrl() {
  const commandBrokerUrl = process.env.MQTT_COMMAND_BROKER_URL?.trim()
  if (commandBrokerUrl) {
    return commandBrokerUrl
  }

  const deviceBrokerHost = process.env.DEVICE_BOOTSTRAP_MQTT_HOST?.trim()
  if (deviceBrokerHost) {
    return buildMqttUrl(
      deviceBrokerHost,
      process.env.DEVICE_BOOTSTRAP_MQTT_PORT,
      parseBoolean(process.env.DEVICE_BOOTSTRAP_MQTT_TLS)
    )
  }

  return process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883'
}

function describeBrokerTarget(brokerUrl: string) {
  try {
    const parsed = new URL(brokerUrl)
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`
  } catch {
    return brokerUrl.replace(/^mqtts?:\/\//i, '')
  }
}

function getDeviceBrokerTarget() {
  const deviceBrokerHost = process.env.DEVICE_BOOTSTRAP_MQTT_HOST?.trim()
  if (!deviceBrokerHost) return null

  return describeBrokerTarget(
    buildMqttUrl(
      deviceBrokerHost,
      process.env.DEVICE_BOOTSTRAP_MQTT_PORT,
      parseBoolean(process.env.DEVICE_BOOTSTRAP_MQTT_TLS)
    )
  )
}

function isFreshOnlineDevice(device: { status?: string | null; last_seen_at?: string | null } | null) {
  if (!device || device.status !== 'online' || !device.last_seen_at) {
    return false
  }

  const lastSeenAt = new Date(device.last_seen_at).getTime()
  return Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt <= DEVICE_START_FRESH_MS
}

function formatLastSeenAge(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) return 'never'

  const elapsedSeconds = Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 1000)
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 'unknown'
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`

  const elapsedMinutes = Math.round(elapsedSeconds / 60)
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`

  return `${Math.round(elapsedMinutes / 60)}h ago`
}

async function fetchLatestStartFailure(sessionId: string) {
  try {
    const adminClient = createServiceRoleClient()
    if (!adminClient) return null

    const { data, error } = await adminClient
      .from('audit_logs')
      .select('action, metadata, created_at')
      .eq('entity_type', 'session')
      .eq('entity_id', sessionId)
      .in('action', ['session_preflight_failed', 'session_timeout', 'pcg_inference_failed', 'ecg_inference_failed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    if (data.action === 'session_preflight_failed') {
      const reason = data.metadata?.reason || 'signal preflight failed'
      return `Device rejected the capture during preflight: ${reason}. Check ECG leads and stethoscope contact, then try again.`
    }

    if (data.action === 'session_timeout') {
      return 'The hardware stopped sending live data before the capture completed. Check Wi-Fi stability and sensor connections, then try again.'
    }

    if (data.action === 'pcg_inference_failed' || data.action === 'ecg_inference_failed') {
      return 'Capture finished, but downstream processing failed. Please retry the session and review service logs if it repeats.'
    }

    return null
  } catch (error) {
    console.error('Failed to fetch latest session start failure:', error)
    return null
  }
}

async function writeSessionAuditLog(input: {
  orgId: string
  userId: string
  sessionId: string
  action: string
  metadata: Record<string, unknown>
}) {
  try {
    const adminClient = createServiceRoleClient()
    if (!adminClient) return

    const { error } = await adminClient
      .from('audit_logs')
      .insert({
        org_id: input.orgId,
        user_id: input.userId,
        action: input.action,
        entity_type: 'session',
        entity_id: input.sessionId,
        metadata: input.metadata,
      })

    if (error) {
      console.error(`Audit log failed (${input.action}):`, error)
    }
  } catch (error) {
    console.error(`Audit log failed (${input.action}):`, error)
  }
}

function publishStartCommand(
  brokerUrl: string,
  username: string,
  password: string,
  topic: string,
  payload: string
) {
  return new Promise<void>((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      username,
      password,
      connectTimeout: 5000,
    })

    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    client.on('connect', () => {
      client.publish(topic, payload, { qos: 1 }, (err) => {
        client.end()

        if (err) {
          finish(() => reject(err))
          return
        }

        finish(() => resolve())
      })
    })

    client.on('error', (err) => {
      client.end(true)
      finish(() => reject(err))
    })
  })
}

async function waitForSessionAcknowledgement(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  sessionId: string
) {
  const deadline = Date.now() + START_ACK_TIMEOUT_MS

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('sessions')
      .select('status')
      .eq('id', sessionId)
      .single()

    if (!error && data && data.status !== 'created') {
      return data.status
    }

    await new Promise((resolve) => setTimeout(resolve, START_ACK_POLL_MS))
  }

  return 'created'
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    if (!UUID_RE.test(params.id)) {
      return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
    }

    const { data: { session: authSession } } = await supabase.auth.getSession()

    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the session & profile to verify access
    const { data: session, error: sessionFetchError } = await supabase
      .from('sessions')
      .select('device_id, org_id, status')
      .eq('id', params.id)
      .single()

    if (sessionFetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', authSession.user.id)
      .single()

    if (!profile || profile.org_id !== session.org_id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, device_name, status, last_seen_at')
      .eq('id', session.device_id)
      .eq('org_id', session.org_id)
      .single()

    if (deviceError || !device) {
      return NextResponse.json({ error: 'Selected device was not found for this organization.' }, { status: 404 })
    }

    if (!isFreshOnlineDevice(device)) {
      return NextResponse.json(
        {
          error: `${device.device_name || 'Selected device'} is not ready for capture. Last seen: ${formatLastSeenAge(device.last_seen_at)}. Keep the ESP32 powered on, confirm MQTT is connected, then refresh devices before starting.`
        },
        { status: 409 }
      )
    }

    // Attempt to publish MQTT message
    // Publish to the same MQTT broker target used by the ESP32 bootstrap flow.
    const brokerUrl = getStartCommandBrokerUrl()
    const username = process.env.MQTT_USERNAME
    const password = process.env.MQTT_PASSWORD

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Server misconfiguration: MQTT command credentials are missing.' },
        { status: 500 }
      )
    }

    const requestBody = await request.json().catch(() => ({})) as { durationSec?: number | string }
    const requestedDurationRaw =
      requestBody?.durationSec !== undefined
        ? String(requestBody.durationSec)
        : process.env.DEVICE_DEFAULT_SESSION_DURATION_SEC

    const topic = `org/${session.org_id}/device/${session.device_id}/control`
    const captureDurationSec = sanitizeCaptureDuration(requestedDurationRaw)
    const payload = JSON.stringify({
      command: 'start',
      session_id: params.id,
      duration_sec: captureDurationSec,
    })

    try {
      await publishStartCommand(brokerUrl, username, password, topic, payload)
      await writeSessionAuditLog({
        orgId: session.org_id,
        userId: authSession.user.id,
        sessionId: params.id,
        action: 'session_start_command_published',
        metadata: {
          device_id: session.device_id,
          broker_target: describeBrokerTarget(brokerUrl),
          device_broker_target: getDeviceBrokerTarget(),
          duration_sec: captureDurationSec,
        },
      })
    } catch (err) {
      console.error('MQTT start command error:', err)
      return NextResponse.json({ error: 'Failed to send start command' }, { status: 500 })
    }

    const status = await waitForSessionAcknowledgement(supabase, params.id)
    if (status === 'created') {
      const commandBrokerTarget = describeBrokerTarget(brokerUrl)
      const deviceBrokerTarget = getDeviceBrokerTarget()
      await writeSessionAuditLog({
        orgId: session.org_id,
        userId: authSession.user.id,
        sessionId: params.id,
        action: 'session_start_no_ack',
        metadata: {
          device_id: session.device_id,
          device_name: device.device_name,
          device_last_seen_at: device.last_seen_at,
          command_broker_target: commandBrokerTarget,
          device_broker_target: deviceBrokerTarget,
          duration_sec: captureDurationSec,
        },
      })

      const brokerHint = deviceBrokerTarget && deviceBrokerTarget !== commandBrokerTarget
        ? ` The command broker is ${commandBrokerTarget}, while the ESP32 bootstrap broker is ${deviceBrokerTarget}; align these broker settings or reprovision the ESP32.`
        : ` Command broker: ${commandBrokerTarget}.`

      return NextResponse.json(
        {
          error: `Device did not acknowledge the start command. The ESP32 is online, but no preflight/start metadata reached the session within ${Math.round(START_ACK_TIMEOUT_MS / 1000)} seconds.${brokerHint} Check Serial Monitor for “[MQTT] Control command: start” and confirm the broker/topic match.`
        },
        { status: 504 }
      )
    }

    if (status === 'error') {
      const failureMessage = await fetchLatestStartFailure(params.id)
      return NextResponse.json(
        {
          error: failureMessage || 'Device rejected the session before streaming started. Check sensor placement and try again.'
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ success: true, status, durationSec: captureDurationSec })

  } catch (error: any) {
    console.error('Error starting session via MQTT:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
