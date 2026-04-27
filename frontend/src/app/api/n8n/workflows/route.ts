import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type EmailPayload = {
  emailFrom?: string
  emailTo: string
  emailSubject: string
  emailText: string
}

type WorkflowResult = {
  ok: boolean
  action: string
  summary: Record<string, unknown>
  emails: EmailPayload[]
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

function env(name: string, fallback = '') {
  const value = process.env[name]
  return value === undefined || value === null || value === '' ? fallback : value
}

function requireInternalToken(request: Request) {
  const internalToken = process.env.INTERNAL_API_TOKEN
  if (!internalToken) {
    return jsonNoStore({ error: 'INTERNAL_API_TOKEN is not configured' }, 500)
  }

  if (request.headers.get('x-internal-token') !== internalToken) {
    return jsonNoStore({ error: 'Unauthorized' }, 401)
  }

  return null
}

function serviceClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service credentials are missing')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function publicAppUrl() {
  return env('ASCULTICOR_PUBLIC_APP_URL', env('DEVICE_BOOTSTRAP_PUBLIC_BASE_URL', 'https://srv1621744.hstgr.cloud')).replace(/\/+$/, '')
}

function fallbackEmail() {
  return env('ASCULTICOR_ALERT_EMAIL_TO')
}

function emailFrom() {
  return env('ASCULTICOR_ALERT_EMAIL_FROM', 'AscultiCor <alerts@localhost>')
}

function email(subject: string, text: string, to = fallbackEmail()): EmailPayload | null {
  if (!to) return null
  return {
    emailFrom: emailFrom(),
    emailTo: to,
    emailSubject: subject,
    emailText: text,
  }
}

function result(action: string, summary: Record<string, unknown>, emails: Array<EmailPayload | null> = []): WorkflowResult {
  return {
    ok: true,
    action,
    summary,
    emails: emails.filter((item): item is EmailPayload => Boolean(item?.emailTo)),
  }
}

function isoMinutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

function safeMetadata(row: any) {
  return row && typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {}
}

async function findOpenAlert(supabase: any, deviceId: string, subtype: string, sessionId?: string) {
  const { data, error } = await supabase
    .from('device_alerts')
    .select('*')
    .eq('device_id', deviceId)
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error

  return (data || []).find((row: any) => {
    const metadata = safeMetadata(row)
    return metadata.subtype === subtype && (!sessionId || metadata.session_id === sessionId)
  })
}

async function insertAlert(
  supabase: any,
  fields: {
    device_id: string
    org_id: string
    alert_type: string
    severity: string
    message: string
    metadata: Record<string, unknown>
  },
) {
  const { data, error } = await supabase
    .from('device_alerts')
    .insert({
      ...fields,
      is_resolved: false,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

async function latestTelemetry(supabase: any, deviceId: string) {
  const { data, error } = await supabase
    .from('device_telemetry')
    .select('*')
    .eq('device_id', deviceId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

async function runClinicalAlerts(supabase: any) {
  const since = isoMinutesAgo(10)
  const emails: Array<EmailPayload | null> = []
  let created = 0
  let skipped = 0

  async function createClinicalAlert(input: {
    session: any
    prediction: any | null
    subtype: string
    title: string
    message: string
    confidence: number | null
  }) {
    const existing = await findOpenAlert(supabase, input.session.device_id, input.subtype, input.session.id)
    if (existing) {
      skipped += 1
      return
    }

    await insertAlert(supabase, {
      device_id: input.session.device_id,
      org_id: input.session.org_id,
      alert_type: input.subtype === 'session_error' ? 'error' : 'anomaly_detected',
      severity: input.subtype === 'session_error' ? 'critical' : 'warning',
      message: input.message,
      metadata: {
        session_id: input.session.id,
        prediction_id: input.prediction?.id || null,
        subtype: input.subtype,
        modality: input.prediction?.modality || null,
        confidence: input.confidence,
        source: 'n8n-clinical-alerts',
      },
    })

    created += 1
    const patient = input.session.patient
    const recipient = patient?.email || fallbackEmail()
    const deviceName = input.session.device?.device_name || input.session.device_id
    emails.push(email(
      `[AscultiCor] ${input.title}`,
      [
        `Hello${patient?.full_name ? ` ${patient.full_name}` : ''},`,
        '',
        input.title,
        '',
        `Device: ${deviceName}`,
        `Session: ${input.session.id}`,
        `Confidence: ${input.confidence === null || input.confidence === undefined ? 'N/A' : `${Math.round(input.confidence * 100)}%`}`,
        `Session link: ${publicAppUrl()}/session/${input.session.id}`,
        '',
        'This notification is for workflow review and is not a medical diagnosis.',
      ].join('\n'),
      recipient,
    ))
  }

  const { data: predictions, error: predictionError } = await supabase
    .from('predictions')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)
  if (predictionError) throw predictionError

  for (const prediction of predictions || []) {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, patient:patients(full_name,email), device:devices(device_name)')
      .eq('id', prediction.session_id)
      .maybeSingle()
    if (sessionError) throw sessionError
    if (!session) continue

    const output = prediction.output_json || {}
    if (prediction.modality === 'pcg' && output.label === 'Murmur') {
      await createClinicalAlert({
        session,
        prediction,
        subtype: 'pcg_murmur',
        title: 'Warning: Murmur detected',
        message: `Murmur detected for session ${session.id}`,
        confidence: output.probabilities?.Murmur ?? output.probabilities?.[output.label] ?? null,
      })
    }

    if (prediction.modality === 'ecg' && output.prediction === 'Abnormal') {
      await createClinicalAlert({
        session,
        prediction,
        subtype: 'ecg_abnormal',
        title: 'Warning: Abnormal ECG',
        message: `Abnormal ECG detected for session ${session.id}`,
        confidence: output.confidence ?? null,
      })
    }
  }

  const { data: errorSessions, error: errorSessionError } = await supabase
    .from('sessions')
    .select('*, patient:patients(full_name,email), device:devices(device_name)')
    .eq('status', 'error')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)
  if (errorSessionError) throw errorSessionError

  for (const session of errorSessions || []) {
    await createClinicalAlert({
      session,
      prediction: null,
      subtype: 'session_error',
      title: 'Critical: Session error',
      message: `Session ${session.id} entered error state`,
      confidence: null,
    })
  }

  return result('clinical-alerts', { created, skipped, emails: emails.filter(Boolean).length }, emails)
}

async function runDeviceHealth(supabase: any) {
  const { data: devices, error } = await supabase
    .from('device_status_overview')
    .select('*')
    .limit(500)
  if (error) throw error

  const emails: Array<EmailPayload | null> = []
  let created = 0
  let resolved = 0
  const now = Date.now()

  async function createHealthAlert(device: any, subtype: string, alertType: string, severity: string, message: string, metadata = {}) {
    if (await findOpenAlert(supabase, device.id, subtype)) return
    await insertAlert(supabase, {
      device_id: device.id,
      org_id: device.org_id,
      alert_type: alertType,
      severity,
      message,
      metadata: {
        subtype,
        source: 'n8n-device-health',
        ...metadata,
      },
    })
    created += 1
    emails.push(email(
      `[AscultiCor] ${severity.toUpperCase()}: ${message}`,
      [
        message,
        '',
        `Device: ${device.device_name || device.id}`,
        `Status: ${device.status || 'unknown'}`,
        `Last seen: ${device.last_seen_at || 'never'}`,
        `Device link: ${publicAppUrl()}/devices/${device.id}`,
      ].join('\n'),
    ))
  }

  for (const device of devices || []) {
    const lastSeenMs = device.last_seen_at ? Date.parse(device.last_seen_at) : 0
    const offline = !lastSeenMs || now - lastSeenMs > 5 * 60 * 1000
    const offlineAlert = await findOpenAlert(supabase, device.id, 'device_offline')

    if (offline) {
      await createHealthAlert(device, 'device_offline', 'offline', 'critical', `Device ${device.device_name || device.id} is offline`)
    } else if (offlineAlert) {
      const { error: resolveError } = await supabase
        .from('device_alerts')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', offlineAlert.id)
      if (resolveError) throw resolveError
      resolved += 1
    }

    const telemetry = await latestTelemetry(supabase, device.id)
    const rssi = telemetry?.wifi_rssi ?? device.signal_strength
    if (typeof rssi === 'number' && rssi < -75) {
      await createHealthAlert(device, 'weak_rssi', 'error', 'warning', `Device ${device.device_name || device.id} has weak WiFi signal`, { wifi_rssi: rssi })
    }
    if (typeof telemetry?.free_heap_bytes === 'number' && telemetry.free_heap_bytes < 30000) {
      await createHealthAlert(device, 'low_heap', 'error', 'warning', `Device ${device.device_name || device.id} has low free heap`, { free_heap_bytes: telemetry.free_heap_bytes })
    }
    if (typeof telemetry?.error_count === 'number' && telemetry.error_count > 0) {
      await createHealthAlert(device, 'device_error_count', 'error', 'warning', `Device ${device.device_name || device.id} reported errors`, { error_count: telemetry.error_count })
    }
  }

  return result('device-health', { checked: (devices || []).length, created, resolved }, emails)
}

async function callClaudeSummary(prompt: string) {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) return null

  const response = await fetch(`${env('CLAUDE_BASE_URL', 'https://agentrouter.org').replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env('CLAUDE_MODEL', 'claude-sonnet-4-5-20250514'),
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) return null
  const data = await response.json()
  return (data.content || []).filter((block: any) => block.type === 'text').map((block: any) => block.text).join('\n\n') || null
}

async function runDailyDigest(supabase: any) {
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)

  const [{ data: sessions, error: sessionsError }, { data: predictions, error: predictionsError }, { data: alerts, error: alertsError }, { data: devices, error: devicesError }] = await Promise.all([
    supabase.from('sessions').select('*').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).limit(1000),
    supabase.from('predictions').select('*').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).limit(2000),
    supabase.from('device_alerts').select('*').eq('is_resolved', false).order('created_at', { ascending: false }).limit(500),
    supabase.from('device_status_overview').select('*').limit(500),
  ])

  if (sessionsError) throw sessionsError
  if (predictionsError) throw predictionsError
  if (alertsError) throw alertsError
  if (devicesError) throw devicesError

  const completedSessions = (sessions || []).filter((session: any) => ['done', 'completed'].includes(session.status)).length
  const errorSessions = (sessions || []).filter((session: any) => session.status === 'error').length
  const murmurCount = (predictions || []).filter((prediction: any) => prediction.modality === 'pcg' && prediction.output_json?.label === 'Murmur').length
  const abnormalEcgCount = (predictions || []).filter((prediction: any) => prediction.modality === 'ecg' && prediction.output_json?.prediction === 'Abnormal').length
  const offlineDevices = (devices || []).filter((device: any) => {
    if (!device.last_seen_at) return true
    return Date.now() - Date.parse(device.last_seen_at) > 5 * 60 * 1000
  }).length

  const stats = {
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    total_sessions: (sessions || []).length,
    completed_sessions: completedSessions,
    error_sessions: errorSessions,
    murmur_count: murmurCount,
    abnormal_ecg_count: abnormalEcgCount,
    unresolved_alerts: (alerts || []).length,
    offline_devices: offlineDevices,
  }

  const aiSummary = await callClaudeSummary(`Write one concise operational summary for this AscultiCor dashboard data. Do not provide medical diagnosis.\n\n${JSON.stringify(stats, null, 2)}`)
  const digest = [
    'AscultiCor daily operational digest',
    '',
    `Period: ${stats.period_start} to ${stats.period_end}`,
    `Total sessions: ${stats.total_sessions}`,
    `Completed sessions: ${stats.completed_sessions}`,
    `Error sessions: ${stats.error_sessions}`,
    `Murmur findings: ${stats.murmur_count}`,
    `Abnormal ECG findings: ${stats.abnormal_ecg_count}`,
    `Unresolved alerts: ${stats.unresolved_alerts}`,
    `Offline devices: ${stats.offline_devices}`,
    '',
    aiSummary ? `Summary:\n${aiSummary}` : 'Summary: Claude summary unavailable; raw operational counts are shown above.',
  ].join('\n')

  return result('daily-digest', stats, [email('[AscultiCor] Daily Digest', digest)])
}

async function runSummaryEnrichment(supabase: any) {
  const since = isoMinutesAgo(7 * 24 * 60)
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'done')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) throw error

  const groups = new Map<string, any>()
  for (const session of sessions || []) {
    const date = String(session.created_at || '').slice(0, 10)
    const key = `${session.device_id}:${date}`
    if (!groups.has(key)) {
      groups.set(key, {
        device_id: session.device_id,
        org_id: session.org_id,
        recording_date: date,
        total_sessions: 0,
        total_recordings: 0,
        total_duration_seconds: 0,
        pcg_normal_count: 0,
        pcg_murmur_count: 0,
        ecg_normal_count: 0,
        ecg_abnormal_count: 0,
        llm_reports_count: 0,
        summary_json: { source: 'n8n-summary-enrichment', generated_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
    }

    const group = groups.get(key)
    group.total_sessions += 1
    group.total_recordings += 1
    if (session.started_at && session.ended_at) {
      group.total_duration_seconds += Math.max(0, Math.round((Date.parse(session.ended_at) - Date.parse(session.started_at)) / 1000))
    }

    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('*')
      .eq('session_id', session.id)
    if (predictionsError) throw predictionsError

    for (const prediction of predictions || []) {
      if (prediction.modality === 'pcg' && prediction.output_json?.label === 'Normal') group.pcg_normal_count += 1
      if (prediction.modality === 'pcg' && prediction.output_json?.label === 'Murmur') group.pcg_murmur_count += 1
      if (prediction.modality === 'ecg' && prediction.output_json?.prediction === 'Normal') group.ecg_normal_count += 1
      if (prediction.modality === 'ecg' && prediction.output_json?.prediction === 'Abnormal') group.ecg_abnormal_count += 1
    }

    const { data: reports, error: reportsError } = await supabase
      .from('llm_reports')
      .select('id')
      .eq('session_id', session.id)
      .eq('status', 'completed')
    if (reportsError) throw reportsError
    group.llm_reports_count += (reports || []).length
  }

  const rows = Array.from(groups.values())
  if (rows.length) {
    const { error: upsertError } = await supabase
      .from('device_recording_summaries')
      .upsert(rows, { onConflict: 'device_id,recording_date' })
    if (upsertError) throw upsertError
  }

  return result('summary-enrichment', { updated_dates: rows.length, sessions: (sessions || []).length })
}

function internalHostHeaders(extra: Record<string, string> = {}) {
  let host = env('ASCULTICOR_INTERNAL_HOST_HEADER')
  if (!host) {
    try {
      host = new URL(publicAppUrl()).host
    } catch {
      host = 'srv1621744.hstgr.cloud'
    }
  }
  return {
    Host: host,
    'X-Forwarded-Host': host,
    'X-Forwarded-Proto': 'https',
    ...extra,
  }
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers })
  const text = await response.text()
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function runOpsMonitoring(supabase: any) {
  const issues: string[] = []
  const inferenceUrl = env('ASCULTICOR_INFERENCE_URL', 'http://inference:8000').replace(/\/+$/, '')

  try {
    await getJson(`${inferenceUrl}/health`, internalHostHeaders())
  } catch (error: any) {
    issues.push(`Inference health failed: ${error.message}`)
  }

  try {
    await getJson(`${inferenceUrl}/metrics`, internalHostHeaders({
      'x-internal-token': env('INFERENCE_INTERNAL_TOKEN'),
    }))
  } catch (error: any) {
    issues.push(`Inference metrics failed: ${error.message}`)
  }

  const [pendingRes, generatingRes, oldestPendingRes, oldestGeneratingRes] = await Promise.all([
    supabase.from('llm_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('llm_reports').select('id', { count: 'exact', head: true }).eq('status', 'generating'),
    supabase.from('llm_reports').select('created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('llm_reports').select('created_at').eq('status', 'generating').order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ])

  if (pendingRes.error) throw pendingRes.error
  if (generatingRes.error) throw generatingRes.error
  if (oldestPendingRes.error) throw oldestPendingRes.error
  if (oldestGeneratingRes.error) throw oldestGeneratingRes.error

  const pending = pendingRes.count || 0
  const generating = generatingRes.count || 0
  if (pending > 10) issues.push(`LLM pending queue is high: ${pending}`)
  if (oldestPendingRes.data?.created_at && Date.now() - Date.parse(oldestPendingRes.data.created_at) > 15 * 60 * 1000) {
    issues.push(`Oldest pending LLM report is older than 15 minutes: ${oldestPendingRes.data.created_at}`)
  }
  if (generating > 0 && oldestGeneratingRes.data?.created_at && Date.now() - Date.parse(oldestGeneratingRes.data.created_at) > 15 * 60 * 1000) {
    issues.push(`A generating LLM report has been running too long: ${oldestGeneratingRes.data.created_at}`)
  }

  if (!issues.length) return result('ops-monitoring', { pending, generating, issues: 0 })

  return result('ops-monitoring', { pending, generating, issues: issues.length }, [
    email('[AscultiCor] Ops Monitoring Alert', ['AscultiCor ops monitor found issues:', '', ...issues].join('\n')),
  ])
}

async function runAlertEscalation(supabase: any) {
  const olderThan = isoMinutesAgo(30)
  const { data: alerts, error } = await supabase
    .from('device_alerts')
    .select('*')
    .eq('is_resolved', false)
    .eq('severity', 'critical')
    .lt('created_at', olderThan)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw error

  const emails: Array<EmailPayload | null> = []
  let escalated = 0

  for (const alert of alerts || []) {
    const metadata = safeMetadata(alert)
    if (metadata.escalated_at) continue

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('*')
      .eq('id', alert.device_id)
      .maybeSingle()
    if (deviceError) throw deviceError

    const nextMetadata = {
      ...metadata,
      escalated_at: new Date().toISOString(),
      escalation_channel: 'email',
    }

    const { error: updateError } = await supabase
      .from('device_alerts')
      .update({ metadata: nextMetadata })
      .eq('id', alert.id)
    if (updateError) throw updateError

    escalated += 1
    emails.push(email(
      `[AscultiCor] Escalation: ${alert.message}`,
      [
        'Critical alert still unresolved after 30 minutes.',
        '',
        `Alert: ${alert.message}`,
        `Device: ${device?.device_name || alert.device_id}`,
        `Created at: ${alert.created_at}`,
        `Session: ${metadata.session_id || 'N/A'}`,
        metadata.session_id ? `Session link: ${publicAppUrl()}/session/${metadata.session_id}` : `Device link: ${publicAppUrl()}/devices/${alert.device_id}`,
      ].join('\n'),
    ))
  }

  return result('alert-escalation', { checked: (alerts || []).length, escalated }, emails)
}

export async function POST(request: Request) {
  const unauthorized = requireInternalToken(request)
  if (unauthorized) return unauthorized

  const action = new URL(request.url).searchParams.get('action') || ''
  const supabase = serviceClient()

  try {
    if (action === 'clinical-alerts') return jsonNoStore(await runClinicalAlerts(supabase))
    if (action === 'device-health') return jsonNoStore(await runDeviceHealth(supabase))
    if (action === 'daily-digest') return jsonNoStore(await runDailyDigest(supabase))
    if (action === 'summary-enrichment') return jsonNoStore(await runSummaryEnrichment(supabase))
    if (action === 'ops-monitoring') return jsonNoStore(await runOpsMonitoring(supabase))
    if (action === 'alert-escalation') return jsonNoStore(await runAlertEscalation(supabase))

    return jsonNoStore({ error: `Unknown n8n workflow action: ${action}` }, 400)
  } catch (error: any) {
    console.error(`n8n workflow action failed: ${action}`, error)
    return jsonNoStore({
      ok: false,
      action,
      error: error.message || 'Workflow action failed',
      emails: [],
    }, 500)
  }
}
