import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import mqtt from 'mqtt'

const START_ACK_TIMEOUT_MS = 8000
const START_ACK_POLL_MS = 250
const DEFAULT_CAPTURE_DURATION_SEC = 15
const MIN_CAPTURE_DURATION_SEC = 8
const MAX_CAPTURE_DURATION_SEC = 60

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
    const { data: { session: authSession } } = await supabase.auth.getSession()

    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the session & profile to verify access
    const { data: session, error: sessionFetchError } = await supabase
      .from('sessions')
      .select('device_id, org_id')
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

    // Attempt to publish MQTT message
    // Connect to mosquitto container (or localhost if ran standalone)
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883'
    const username = process.env.MQTT_USERNAME || 'asculticor'
    const password = process.env.MQTT_PASSWORD || 'asc_e4ccc9032dcb46eda42e427ff1b76b92'

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
    } catch (err) {
      console.error('MQTT start command error:', err)
      return NextResponse.json({ error: 'Failed to send start command' }, { status: 500 })
    }

    const status = await waitForSessionAcknowledgement(supabase, params.id)
    if (status === 'created') {
      return NextResponse.json(
        {
          error: 'Device did not acknowledge the start command. Check that the ESP32 is powered on, connected to MQTT, and still printing logs in Serial Monitor.'
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
