import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type EmailPayload = {
  emailFrom?: string
  emailTo: string
  emailSubject: string
  emailText: string
  emailHtml?: string
  alertId?: string
  sessionId?: string
  severity?: 'warning' | 'critical'
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
  return env('ASCULTICOR_PUBLIC_APP_URL', env('DEVICE_BOOTSTRAP_PUBLIC_BASE_URL')).replace(/\/+$/, '')
}

function fallbackEmail() {
  return env('ASCULTICOR_ALERT_EMAIL_TO')
}

function emailFrom() {
  return env('ASCULTICOR_ALERT_EMAIL_FROM', 'AscultiCor <alerts@localhost>')
}

function email(
  subject: string,
  text: string,
  to = fallbackEmail(),
  details: Partial<EmailPayload> = {},
): EmailPayload | null {
  if (!to) return null
  return {
    emailFrom: emailFrom(),
    emailTo: to,
    emailSubject: subject,
    emailText: text,
    ...details,
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function clinicalAlertHtml(input: {
  title: string
  severity: 'warning' | 'critical'
  patientName?: string | null
  deviceName: string
  sessionId: string
  finding: string
  confidence: number | null
}) {
  const critical = input.severity === 'critical'
  const accent = critical ? '#a53f4b' : '#b7791f'
  const pale = critical ? '#fff0f1' : '#fff8e7'
  const confidence = input.confidence === null || input.confidence === undefined
    ? 'Not available'
    : `${Math.round(input.confidence * 100)}%`
  const sessionUrl = `${publicAppUrl()}/session/${input.sessionId}`

  return `<!doctype html><html><body style="margin:0;background:#f2f6f8;font-family:Arial,Helvetica,sans-serif;color:#172b40;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="660" cellspacing="0" cellpadding="0" style="max-width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 22px rgba(11,31,58,.08);">
    <tr><td style="padding:26px 30px;background:#0b1f3a;border-bottom:5px solid ${accent};"><div style="color:#7bd3c7;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">AscultiCor Clinical Review Alert</div><div style="margin-top:8px;color:#fff;font-size:24px;font-weight:800;">${escapeHtml(input.title)}</div></td></tr>
    <tr><td style="padding:24px 30px;"><div style="display:inline-block;padding:6px 11px;border-radius:999px;background:${pale};color:${accent};font-size:12px;font-weight:800;text-transform:uppercase;">${escapeHtml(input.severity)}</div>
      <p style="margin:18px 0 4px;color:#607286;font-size:12px;text-transform:uppercase;">Automated model output</p><p style="margin:0;color:#0b1f3a;font-size:21px;font-weight:800;">${escapeHtml(input.finding)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;background:#f7fafb;border:1px solid #dce4eb;border-radius:10px;"><tr><td style="padding:13px;color:#607286;font-size:12px;">Patient<strong style="display:block;color:#172b40;font-size:14px;">${escapeHtml(input.patientName || 'Not linked')}</strong></td><td style="padding:13px;color:#607286;font-size:12px;">Device<strong style="display:block;color:#172b40;font-size:14px;">${escapeHtml(input.deviceName)}</strong></td><td style="padding:13px;color:#607286;font-size:12px;">Confidence<strong style="display:block;color:#172b40;font-size:14px;">${escapeHtml(confidence)}</strong></td></tr></table>
      <p style="margin:20px 0;color:#314459;font-size:14px;line-height:1.6;">This automated result requires qualified professional review and correlation with the original recording and available context.</p>
      <div style="text-align:center;"><a href="${escapeHtml(sessionUrl)}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#0f766e;color:#fff;text-decoration:none;font-size:14px;font-weight:800;">Review session</a></div>
    </td></tr>
    <tr><td style="padding:16px 22px;background:${pale};border-top:1px solid ${accent};color:${accent};font-size:12px;line-height:1.55;"><strong>Educational use only:</strong> This alert is not a diagnosis or treatment recommendation. Review by a qualified healthcare professional is required.</td></tr>
  </table></td></tr></table></body></html>`
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
    finding: string
  }) {
    const existing = await findOpenAlert(supabase, input.session.device_id, input.subtype, input.session.id)
    if (existing) {
      skipped += 1
      return
    }

    const severity: 'warning' | 'critical' = input.subtype === 'session_error' ? 'critical' : 'warning'
    const alert = await insertAlert(supabase, {
      device_id: input.session.device_id,
      org_id: input.session.org_id,
      alert_type: input.subtype === 'session_error' ? 'error' : 'anomaly_detected',
      severity,
      message: input.message,
      metadata: {
        session_id: input.session.id,
        prediction_id: input.prediction?.id || null,
        subtype: input.subtype,
        modality: input.prediction?.modality || null,
        confidence: input.confidence,
        finding: input.finding,
        source: 'n8n-clinical-alerts',
      },
    })

    created += 1
    const patient = input.session.patient
    const recipient = fallbackEmail() || patient?.email
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
      {
        emailHtml: clinicalAlertHtml({
          title: input.title,
          severity,
          patientName: patient?.full_name,
          deviceName,
          sessionId: input.session.id,
          finding: input.finding,
          confidence: input.confidence,
        }),
        alertId: alert.id,
        sessionId: input.session.id,
        severity,
      },
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
        finding: 'PCG classified as Murmur',
      })
    }

    const ecgClass = String(output.prediction || output.label || '').trim()
    const normalizedEcgClass = ecgClass.toLowerCase()
    if (prediction.modality === 'ecg' && ['abnormal', 'sveb', 'veb', 'fusion'].includes(normalizedEcgClass)) {
      await createClinicalAlert({
        session,
        prediction,
        subtype: `ecg_${normalizedEcgClass}`,
        title: `Warning: ECG ${ecgClass} requires review`,
        message: `ECG ${ecgClass} output detected for session ${session.id}`,
        confidence: output.confidence ?? null,
        finding: `ECG classified as ${ecgClass}`,
      })
    }

    if (prediction.modality === 'ecg' && normalizedEcgClass === 'unknown') {
      await createClinicalAlert({
        session,
        prediction,
        subtype: 'ecg_uninterpretable',
        title: 'Warning: ECG result requires repeat or review',
        message: `ECG output was Unknown for session ${session.id}`,
        confidence: output.confidence ?? null,
        finding: 'ECG result was Unknown / uninterpretable',
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
      finding: 'Session processing entered an error state',
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

  const response = await fetch(`${env('CLAUDE_BASE_URL', 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`, {
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
  const abnormalEcgCount = (predictions || []).filter((prediction: any) =>
    prediction.modality === 'ecg' &&
    ['sveb', 'veb', 'fusion'].includes(String(prediction.output_json?.prediction || '').toLowerCase())
  ).length
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
      host = 'frontend:3000'
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

async function runSessionRecovery(supabase: any) {
  const policies = [
    { status: 'created', minutes: 5, reason: 'start_not_acknowledged' },
    { status: 'streaming', minutes: 5, reason: 'stream_stalled' },
    { status: 'processing', minutes: 20, reason: 'processing_stalled' },
  ]
  const recovered: any[] = []

  for (const policy of policies) {
    const cutoff = isoMinutesAgo(policy.minutes)
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id,org_id,device_id,status,created_at,started_at')
      .eq('status', policy.status)
      .lt(policy.status === 'created' ? 'created_at' : 'started_at', cutoff)
      .limit(100)
    if (error) throw error

    for (const session of sessions || []) {
      const { data: updated, error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'error', ended_at: new Date().toISOString() })
        .eq('id', session.id)
        .eq('status', policy.status)
        .select('id')
      if (updateError) throw updateError
      if (!updated?.length) continue

      const { error: auditError } = await supabase.from('audit_logs').insert({
        org_id: session.org_id,
        user_id: null,
        action: 'session_recovered_to_error',
        entity_type: 'session',
        entity_id: session.id,
        metadata: {
          previous_status: policy.status,
          reason: policy.reason,
          source: 'n8n-session-recovery',
        },
      })
      if (auditError) throw auditError
      recovered.push({ ...session, reason: policy.reason })
    }
  }

  const emails = recovered.length ? [email(
    `[AscultiCor] Recovered ${recovered.length} stalled session${recovered.length === 1 ? '' : 's'}`,
    [
      'AscultiCor marked stalled sessions as error so they no longer remain indefinitely active.',
      '',
      ...recovered.map((item) => `${item.id}: ${item.status} -> error (${item.reason})`),
    ].join('\n'),
  )] : []
  return result('session-recovery', { checked_policies: policies.length, recovered: recovered.length }, emails)
}

async function runReportDeadLetter(supabase: any) {
  const { data: reports, error } = await supabase
    .from('llm_reports')
    .select('id,org_id,session_id,device_id,retry_count,max_retries,error_message,created_at')
    .eq('status', 'error')
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw error

  const deadLetters = (reports || []).filter((report: any) =>
    Number(report.retry_count || 0) >= Number(report.max_retries || 3)
  )
  const newlyNotified: any[] = []

  for (const report of deadLetters) {
    const { data: existing, error: existingError } = await supabase
      .from('audit_logs')
      .select('id')
      .eq('action', 'llm_report_dead_letter_notified')
      .eq('entity_type', 'llm_report')
      .eq('entity_id', report.id)
      .limit(1)
    if (existingError) throw existingError
    if (existing?.length) continue

    const { error: auditError } = await supabase.from('audit_logs').insert({
      org_id: report.org_id,
      user_id: null,
      action: 'llm_report_dead_letter_notified',
      entity_type: 'llm_report',
      entity_id: report.id,
      metadata: {
        session_id: report.session_id,
        retry_count: report.retry_count,
        max_retries: report.max_retries,
        error_message: report.error_message,
        source: 'n8n-report-dlq',
      },
    })
    if (auditError) throw auditError
    newlyNotified.push(report)
  }

  const emails = newlyNotified.length ? [email(
    `[AscultiCor] ${newlyNotified.length} report${newlyNotified.length === 1 ? '' : 's'} entered the dead-letter queue`,
    [
      'These reports exhausted automatic retries and require administrator review.',
      '',
      ...newlyNotified.map((item) =>
        `Report ${item.id} | session ${item.session_id} | retries ${item.retry_count}/${item.max_retries} | ${item.error_message || 'No error detail'}`
      ),
    ].join('\n'),
  )] : []
  return result('report-dead-letter', {
    dead_letters: deadLetters.length,
    newly_notified: newlyNotified.length,
  }, emails)
}

async function runClinicalAcknowledgement(supabase: any) {
  const alerts = await runClinicalAlerts(supabase)
  const escalations = await runAlertEscalation(supabase)
  return result('clinical-acknowledgement', {
    alerts: alerts.summary,
    escalations: escalations.summary,
  }, [...alerts.emails, ...escalations.emails])
}

async function runStorageIntegrity(supabase: any) {
  const since = isoMinutesAgo(24 * 60)
  const { data: recordings, error } = await supabase
    .from('recordings')
    .select('id,org_id,session_id,modality,storage_path,checksum,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error

  const missing: any[] = []
  let verified = 0
  for (const recording of recordings || []) {
    const { data, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(recording.storage_path)
    if (downloadError || !data || data.size === 0) {
      missing.push({ ...recording, error: downloadError?.message || 'empty object' })
    } else {
      verified += 1
    }
  }

  const emails = missing.length ? [email(
    `[AscultiCor] Storage integrity warning: ${missing.length} object${missing.length === 1 ? '' : 's'}`,
    [
      'Database recording rows were found without a readable, non-empty storage object.',
      '',
      ...missing.map((item) => `${item.storage_path} | session ${item.session_id} | ${item.error}`),
    ].join('\n'),
  )] : []
  return result('storage-integrity', {
    sampled: (recordings || []).length,
    verified,
    missing: missing.length,
  }, emails)
}

async function runResearchQuality(supabase: any) {
  const since = isoMinutesAgo(7 * 24 * 60)
  const [{ data: sessions, error: sessionsError }, { data: predictions, error: predictionsError }] = await Promise.all([
    supabase.from('sessions').select('id,status,device_id,created_at').gte('created_at', since).limit(5000),
    supabase.from('predictions').select('session_id,modality,model_name,model_version,output_json').gte('created_at', since).limit(10000),
  ])
  if (sessionsError) throw sessionsError
  if (predictionsError) throw predictionsError

  const bySession = new Map<string, Set<string>>()
  let unknownEcg = 0
  const modelVersions = new Set<string>()
  for (const prediction of predictions || []) {
    if (!bySession.has(prediction.session_id)) bySession.set(prediction.session_id, new Set())
    bySession.get(prediction.session_id)!.add(prediction.modality)
    modelVersions.add(`${prediction.model_name}@${prediction.model_version}`)
    if (prediction.modality === 'ecg' && prediction.output_json?.prediction === 'Unknown') unknownEcg += 1
  }

  const completed = (sessions || []).filter((item: any) => item.status === 'done')
  const missingPredictions = completed.filter((item: any) => {
    const modalities = bySession.get(item.id) || new Set()
    return !modalities.has('pcg') || !modalities.has('ecg')
  })
  const errorSessions = (sessions || []).filter((item: any) => item.status === 'error').length
  const summary = {
    period_days: 7,
    sessions: (sessions || []).length,
    completed: completed.length,
    errors: errorSessions,
    completed_missing_prediction_pair: missingPredictions.length,
    unknown_ecg_predictions: unknownEcg,
    model_versions: Array.from(modelVersions).sort(),
  }

  return result('research-quality', summary, [email(
    '[AscultiCor] Weekly Research & Data Quality Report',
    [
      'AscultiCor weekly research/data-quality summary (engineering use; not clinical evidence).',
      '',
      `Sessions: ${summary.sessions}`,
      `Completed: ${summary.completed}`,
      `Errors: ${summary.errors}`,
      `Completed sessions missing ECG/PCG prediction pair: ${summary.completed_missing_prediction_pair}`,
      `Unknown ECG outputs: ${summary.unknown_ecg_predictions}`,
      `Model versions: ${summary.model_versions.join(', ') || 'No predictions'}`,
    ].join('\n'),
  )])
}

async function runWorkflowFailure(supabase: any, request: Request) {
  const body = await request.json().catch(() => ({}))
  const workflowName = String(body.workflow_name || body.workflowName || 'unknown').slice(0, 160)
  const executionId = String(body.execution_id || body.executionId || '').slice(0, 160)
  const errorMessage = String(body.error || body.error_message || 'Workflow execution failed').slice(0, 2000)
  const { error } = await supabase.from('audit_logs').insert({
    org_id: null,
    user_id: null,
    action: 'n8n_workflow_failed',
    entity_type: 'n8n_execution',
    entity_id: null,
    metadata: {
      workflow_name: workflowName,
      execution_id: executionId,
      error: errorMessage,
      last_node: body.last_node || body.lastNode || null,
      occurred_at: body.occurred_at || new Date().toISOString(),
    },
  })
  if (error) throw error
  return result('workflow-failure', { recorded: 1, workflow_name: workflowName }, [email(
    `[AscultiCor] n8n workflow failed: ${workflowName}`,
    `Execution: ${executionId || 'unknown'}\nLast node: ${body.last_node || body.lastNode || 'unknown'}\nError: ${errorMessage}`,
  )])
}

async function runSecurityAudit(supabase: any) {
  const since = isoMinutesAgo(30)
  const watchedActions = [
    'device_bootstrap_requested',
    'session_start_no_ack',
    'n8n_workflow_failed',
    'firmware_deployment_failed',
  ]
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('action,entity_type,entity_id,created_at,metadata')
    .in('action', watchedActions)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error

  const counts = Object.fromEntries(watchedActions.map((action) => [
    action,
    (logs || []).filter((item: any) => item.action === action).length,
  ]))
  const issues: string[] = []
  if (counts.device_bootstrap_requested > 20) issues.push(`High bootstrap volume: ${counts.device_bootstrap_requested} in 30 minutes`)
  if (counts.session_start_no_ack > 3) issues.push(`Repeated unacknowledged session starts: ${counts.session_start_no_ack}`)
  if (counts.n8n_workflow_failed > 3) issues.push(`Repeated n8n workflow failures: ${counts.n8n_workflow_failed}`)
  if (counts.firmware_deployment_failed > 0) issues.push(`Firmware deployment failures: ${counts.firmware_deployment_failed}`)

  return result('security-audit', { events: (logs || []).length, issues: issues.length, counts }, issues.length ? [email(
    '[AscultiCor] Security & Audit Anomaly Warning',
    ['Potential operational/security anomalies were detected:', '', ...issues].join('\n'),
  )] : [])
}

async function runOpsSecurity(supabase: any) {
  const ops = await runOpsMonitoring(supabase)
  const security = await runSecurityAudit(supabase)
  return result('ops-security', { ops: ops.summary, security: security.summary }, [...ops.emails, ...security.emails])
}

async function runDailyOperations(supabase: any) {
  const enrichment = await runSummaryEnrichment(supabase)
  const digest = await runDailyDigest(supabase)
  return result('daily-operations', { enrichment: enrichment.summary, digest: digest.summary }, digest.emails)
}

export async function POST(request: Request) {
  const unauthorized = requireInternalToken(request)
  if (unauthorized) return unauthorized

  const action = new URL(request.url).searchParams.get('action') || ''
  const supabase = serviceClient()

  try {
    if (action === 'session-recovery') return jsonNoStore(await runSessionRecovery(supabase))
    if (action === 'report-dead-letter') return jsonNoStore(await runReportDeadLetter(supabase))
    if (action === 'clinical-acknowledgement') return jsonNoStore(await runClinicalAcknowledgement(supabase))
    if (action === 'storage-integrity') return jsonNoStore(await runStorageIntegrity(supabase))
    if (action === 'research-quality') return jsonNoStore(await runResearchQuality(supabase))
    if (action === 'workflow-failure') return jsonNoStore(await runWorkflowFailure(supabase, request))
    if (action === 'security-audit') return jsonNoStore(await runSecurityAudit(supabase))
    if (action === 'ops-security') return jsonNoStore(await runOpsSecurity(supabase))
    if (action === 'daily-operations') return jsonNoStore(await runDailyOperations(supabase))
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
