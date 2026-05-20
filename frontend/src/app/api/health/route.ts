import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEVICE_OFFLINE_THRESHOLD_MS = 90 * 1000
const REQUEST_TIMEOUT_MS = 3500

type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

function serviceStatus(ok: boolean, fallback: ServiceStatus = 'unhealthy'): ServiceStatus {
  return ok ? 'healthy' : fallback
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || 'Unknown error')
}

function getInferenceBaseUrl() {
  return (process.env.ASCULTICOR_INFERENCE_URL || 'http://inference:8000').replace(/\/+$/, '')
}

function getServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    })
    const body = await response.json().catch(() => null)
    return {
      ok: response.ok,
      status: response.status,
      body,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function getInferenceHealth() {
  try {
    const response = await fetchJsonWithTimeout(`${getInferenceBaseUrl()}/health`)
    return {
      status: response.ok ? response.body?.status || 'healthy' : 'unhealthy',
      httpStatus: response.status,
      mqttConnected: Boolean(response.body?.mqtt_connected),
      supabaseConnected: Boolean(response.body?.supabase_connected),
      storageConnected: Boolean(response.body?.storage_connected),
      demoMode: Boolean(response.body?.demo_mode),
      activeSessions: Number(response.body?.active_sessions || 0),
      modelsLoaded: Number(response.body?.models_loaded || 0),
      modelsTotal: Number(response.body?.models_total || 0),
      models: response.body?.models || {},
      error: response.ok ? null : response.body?.detail || response.body?.error || 'Inference health check failed',
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      httpStatus: null,
      mqttConnected: false,
      supabaseConnected: false,
      storageConnected: false,
      demoMode: false,
      activeSessions: 0,
      modelsLoaded: 0,
      modelsTotal: 0,
      models: {},
      error: toErrorMessage(error),
    }
  }
}

async function getInferenceMetrics() {
  const token = process.env.INFERENCE_INTERNAL_TOKEN
  if (!token) {
    return {
      status: 'unknown' as ServiceStatus,
      error: 'INFERENCE_INTERNAL_TOKEN is not configured',
      activeSessions: null,
      buffers: [],
      mqttConnected: null,
    }
  }

  try {
    const response = await fetchJsonWithTimeout(`${getInferenceBaseUrl()}/metrics`, {
      headers: {
        'x-internal-token': token,
      },
    })

    return {
      status: serviceStatus(response.ok),
      error: response.ok ? null : response.body?.detail || response.body?.error || 'Inference metrics check failed',
      activeSessions: Number(response.body?.active_sessions || 0),
      buffers: response.body?.buffers || [],
      mqttConnected: typeof response.body?.mqtt_connected === 'boolean' ? response.body.mqtt_connected : null,
    }
  } catch (error) {
    return {
      status: 'unhealthy' as ServiceStatus,
      error: toErrorMessage(error),
      activeSessions: null,
      buffers: [],
      mqttConnected: null,
    }
  }
}

async function getSupabaseSummary() {
  const supabase = getServiceRoleClient()
  if (!supabase) {
    return {
      status: 'unknown' as ServiceStatus,
      error: 'Supabase service credentials are not configured',
      devices: { total: 0, online: 0, stale: 0, offline: 0 },
      sessions: { active: 0 },
      reports: { pending: 0, generating: 0 },
    }
  }

  try {
    const [
      organizationsRes,
      devicesRes,
      activeSessionsRes,
      pendingReportsRes,
      generatingReportsRes,
    ] = await Promise.all([
      supabase.from('organizations').select('id').limit(1),
      supabase.from('devices').select('id, status, last_seen_at'),
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['streaming', 'processing']),
      supabase
        .from('llm_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('llm_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'generating'),
    ])

    if (organizationsRes.error) throw organizationsRes.error
    if (devicesRes.error) throw devicesRes.error
    if (activeSessionsRes.error) throw activeSessionsRes.error
    if (pendingReportsRes.error) throw pendingReportsRes.error
    if (generatingReportsRes.error) throw generatingReportsRes.error

    const now = Date.now()
    const devices = devicesRes.data || []
    const online = devices.filter((device: any) => {
      if (device.status === 'error' || device.status === 'offline') return false
      if (!device.last_seen_at) return false
      const lastSeenAt = new Date(device.last_seen_at).getTime()
      return Number.isFinite(lastSeenAt) && now - lastSeenAt <= DEVICE_OFFLINE_THRESHOLD_MS
    }).length
    const stale = devices.filter((device: any) => {
      if (!device.last_seen_at) return false
      const lastSeenAt = new Date(device.last_seen_at).getTime()
      return Number.isFinite(lastSeenAt) && now - lastSeenAt > DEVICE_OFFLINE_THRESHOLD_MS
    }).length

    return {
      status: 'healthy' as ServiceStatus,
      error: null,
      devices: {
        total: devices.length,
        online,
        stale,
        offline: Math.max(0, devices.length - online),
      },
      sessions: {
        active: activeSessionsRes.count || 0,
      },
      reports: {
        pending: pendingReportsRes.count || 0,
        generating: generatingReportsRes.count || 0,
      },
    }
  } catch (error) {
    return {
      status: 'unhealthy' as ServiceStatus,
      error: toErrorMessage(error),
      devices: { total: 0, online: 0, stale: 0, offline: 0 },
      sessions: { active: 0 },
      reports: { pending: 0, generating: 0 },
    }
  }
}

export async function GET() {
  const [supabase, inference, metrics] = await Promise.all([
    getSupabaseSummary(),
    getInferenceHealth(),
    getInferenceMetrics(),
  ])

  const inferenceStatus = inference.status === 'healthy' ? 'healthy' : 'degraded'
  const status: ServiceStatus =
    supabase.status === 'unhealthy'
      ? 'unhealthy'
      : inferenceStatus === 'healthy' && metrics.status !== 'unhealthy'
        ? 'healthy'
        : 'degraded'

  return jsonNoStore({
    status,
    checkedAt: new Date().toISOString(),
    services: {
      supabase: {
        status: supabase.status,
        error: supabase.error,
      },
      inference: {
        status: inferenceStatus,
        error: inference.error,
        httpStatus: inference.httpStatus,
      },
      inferenceMetrics: {
        status: metrics.status,
        error: metrics.error,
      },
    },
    devices: supabase.devices,
    sessions: {
      active: Math.max(supabase.sessions.active, metrics.activeSessions || 0),
    },
    reports: supabase.reports,
    inference: {
      mqttConnected: inference.mqttConnected || metrics.mqttConnected === true,
      supabaseConnected: inference.supabaseConnected,
      storageConnected: inference.storageConnected,
      demoMode: inference.demoMode,
      activeSessions: Math.max(inference.activeSessions, metrics.activeSessions || 0),
      modelsLoaded: inference.modelsLoaded,
      modelsTotal: inference.modelsTotal,
      models: inference.models,
      buffers: metrics.buffers,
    },
  })
}
