import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import mqtt from 'mqtt'
import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials are unavailable')
  return createClient(url, key)
}

function publicAppUrl() {
  return (
    process.env.DEVICE_BOOTSTRAP_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '')
}

function mqttBrokerUrl() {
  return process.env.MQTT_COMMAND_BROKER_URL || process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883'
}

async function readFirmwareManifest() {
  const candidates = [
    '/app/public/firmware/manifest.json',
    path.join(process.cwd(), 'public', 'firmware', 'manifest.json'),
  ]
  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, 'utf8'))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Firmware manifest not found')
}

async function publishUpdate(input: {
  orgId: string
  deviceId: string
  version: string
  binaryPath: string
  sha256: string
  deploymentId: string
}) {
  const client = mqtt.connect(mqttBrokerUrl(), {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    connectTimeout: 10_000,
    reconnectPeriod: 0,
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MQTT connection timed out')), 12_000)
      client.once('connect', () => {
        clearTimeout(timeout)
        resolve()
      })
      client.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
    })

    const topic = `org/${input.orgId}/device/${input.deviceId}/control`
    const url = input.binaryPath.startsWith('http')
      ? input.binaryPath
      : `${publicAppUrl()}${input.binaryPath.startsWith('/') ? '' : '/'}${input.binaryPath}`

    await new Promise<void>((resolve, reject) => {
      client.publish(topic, JSON.stringify({
        command: 'firmware_update',
        deployment_id: input.deploymentId,
        version: input.version,
        url,
        sha256: input.sha256,
      }), { qos: 1 }, error => error ? reject(error) : resolve())
    })
  } finally {
    client.end(true)
  }
}

async function requireAdmin() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Administrator access required' }, { status: 403 }) }
  }
  return { user, profile }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { data, error } = await serviceClient()
    .from('firmware_deployments')
    .select('*, firmware_releases(*)')
    .eq('org_id', auth.profile.org_id)
    .order('requested_at', { ascending: false })
    .limit(100)

  return NextResponse.json(error ? { error: error.message } : { deployments: data }, {
    status: error ? 500 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request) {
  const action = new URL(request.url).searchParams.get('action')

  if (action === 'dispatch') {
    if (request.headers.get('x-internal-token') !== process.env.INTERNAL_API_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = serviceClient()
    const { data: jobs, error } = await db
      .from('firmware_deployments')
      .select('*, firmware_releases(*)')
      .eq('status', 'queued')
      .order('requested_at', { ascending: true })
      .limit(10)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const results = []
    for (const job of jobs || []) {
      try {
        await publishUpdate({
          orgId: job.org_id,
          deviceId: job.device_id,
          version: job.firmware_releases.version,
          binaryPath: job.firmware_releases.binary_path,
          sha256: job.firmware_releases.sha256,
          deploymentId: job.id,
        })
        await db.from('firmware_deployments').update({
          status: 'dispatched',
          dispatched_at: new Date().toISOString(),
          attempt_count: job.attempt_count + 1,
          last_error: null,
        }).eq('id', job.id)
        results.push({ deploymentId: job.id, status: 'dispatched' })
      } catch (dispatchError) {
        const message = dispatchError instanceof Error ? dispatchError.message : String(dispatchError)
        await db.from('firmware_deployments').update({
          attempt_count: job.attempt_count + 1,
          last_error: message.slice(0, 1000),
        }).eq('id', job.id)
        results.push({ deploymentId: job.id, status: 'retry_pending', error: message })
      }
    }

    return NextResponse.json({
      ok: true,
      action: 'firmware-rollout',
      queued: jobs?.length || 0,
      results,
    })
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const body = await request.json().catch(() => ({}))

  if (action === 'queue-latest') {
    if (!body.device_id) {
      return NextResponse.json({ error: 'device_id is required' }, { status: 400 })
    }
    const db = serviceClient()
    const { data: device } = await db
      .from('devices')
      .select('id, org_id')
      .eq('id', body.device_id)
      .eq('org_id', auth.profile.org_id)
      .maybeSingle()
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    const manifest = await readFirmwareManifest()
    if (!manifest.version || !manifest.ota?.path || !manifest.ota?.sha256 || !manifest.ota?.size) {
      return NextResponse.json({ error: 'The deployed firmware manifest is not OTA-ready' }, { status: 409 })
    }

    await db.from('firmware_releases').update({ is_active: false })
      .eq('channel', 'stable')
      .eq('hardware_model', 'esp32-wroom-32')

    const { data: release, error: releaseError } = await db
      .from('firmware_releases')
      .upsert({
        version: manifest.version,
        channel: 'stable',
        hardware_model: 'esp32-wroom-32',
        binary_path: manifest.ota.path,
        sha256: String(manifest.ota.sha256).toLowerCase(),
        binary_size_bytes: Number(manifest.ota.size),
        release_notes: manifest.description || null,
        is_active: true,
        created_by: auth.user.id,
      }, { onConflict: 'version' })
      .select()
      .single()
    if (releaseError) return NextResponse.json({ error: releaseError.message }, { status: 500 })

    const { data: deployment, error: deploymentError } = await db
      .from('firmware_deployments')
      .insert({
        org_id: device.org_id,
        device_id: device.id,
        release_id: release.id,
        requested_by: auth.user.id,
        metadata: { source: 'asculticor-admin', release_channel: 'stable' },
      })
      .select()
      .single()

    return NextResponse.json(
      deploymentError ? { error: deploymentError.message } : { deployment, release },
      { status: deploymentError ? 500 : 201 }
    )
  }

  if (!body.device_id || !body.release_id) {
    return NextResponse.json({ error: 'device_id and release_id are required' }, { status: 400 })
  }

  const db = serviceClient()
  const { data: device } = await db
    .from('devices')
    .select('id, org_id')
    .eq('id', body.device_id)
    .eq('org_id', auth.profile.org_id)
    .maybeSingle()
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

  const { data, error } = await db.from('firmware_deployments').insert({
    org_id: device.org_id,
    device_id: device.id,
    release_id: body.release_id,
    requested_by: auth.user.id,
    metadata: { source: 'asculticor-admin' },
  }).select().single()

  return NextResponse.json(error ? { error: error.message } : { deployment: data }, {
    status: error ? 500 : 201,
  })
}
