import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

// Type definitions for better type safety
interface SessionData {
  id: string;
  org_id: string;
  created_at: string;
  status: string;
  device_id: string;
  predictions?: PredictionData[];
  murmur_severity?: MurmurSeverityData[];
  device?: {
    device_name: string;
  };
}

interface PredictionData {
  id: string;
  modality: string;
  output_json: {
    label?: string;
    prediction?: string;
    probabilities?: Record<string, number>;
    confidence?: number;
  };
  created_at: string;
}

interface MurmurSeverityData {
  id: string;
  location_json?: { predicted?: string };
  timing_json?: { predicted?: string };
  shape_json?: { predicted?: string };
  grading_json?: { predicted?: string };
  pitch_json?: { predicted?: string };
  quality_json?: { predicted?: string };
}

interface LLMReportData {
  id: string;
  session_id: string;
  org_id: string;
  device_id: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  prompt_text: string;
  report_text: string;
  model_name: string;
  model_version: string;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  last_error_at: string | null;
  error_message: string | null;
  created_at: string;
}

const RATE_LIMIT_MAX = 10; // Max 10 pending reports per user
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// POST /api/llm
// default action: queue report generation
// action=process-pending: process pending reports (internal/cron use only)
export async function POST(request: Request) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action === 'process-pending') {
    return processPendingReports(request)
  }

  return queueReport(request)
}

async function queueReport(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { session_id, device_id } = await request.json()
    const llmProvider = process.env.LLM_PROVIDER || 'demo'

    if (!session_id || !device_id) {
      return NextResponse.json(
        { error: 'Session ID and Device ID are required' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(session_id) || !uuidRegex.test(device_id)) {
      return NextResponse.json(
        { error: 'Invalid session_id or device_id format' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // DB-backed per-user limit (works across multiple app instances)
    const windowStartIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
    const { count: queuedCount, error: queueCountError } = await supabase
      .from('llm_reports')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .eq('requested_by', user.id)
      .in('status', ['pending', 'generating'])
      .gte('created_at', windowStartIso)

    if (queueCountError) throw queueCountError
    if ((queuedCount || 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 queued reports per hour.' },
        { status: 429 }
      )
    }

    // Fetch session with predictions
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        *,
        predictions(*),
        murmur_severity(*),
        device:devices(device_name)
      `)
      .eq('id', session_id)
      .eq('org_id', profile.org_id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Return existing completed report if present
    const { data: existingCompleted } = await supabase
      .from('llm_reports')
      .select('*')
      .eq('session_id', session_id)
      .eq('status', 'completed')
      .single()

    if (existingCompleted) {
      return NextResponse.json({
        report: existingCompleted,
        message: 'Report already exists'
      })
    }

    // Return existing pending/generating report if present
    const { data: existingQueued } = await supabase
      .from('llm_reports')
      .select('*')
      .eq('session_id', session_id)
      .in('status', ['pending', 'generating'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingQueued) {
      return NextResponse.json({
        report: existingQueued,
        message: 'Report already queued',
        queued: true
      }, { status: 202 })
    }

    // Create pending report entry (async processing)
    const reportId = randomUUID()
    const { data: report, error: reportError } = await supabase
      .from('llm_reports')
      .insert({
        id: reportId,
        org_id: profile.org_id,
        session_id,
        device_id,
        requested_by: user.id,
        status: 'pending',
        prompt_text: generatePrompt(session),
        report_text: '',
        model_name: llmProvider === 'demo' ? 'demo-template' : llmProvider,
        model_version: llmProvider === 'demo' ? 'v1' : 'unconfigured',
        retry_count: 0,
        max_retries: 3,
        next_retry_at: null,
        last_error_at: null
      })
      .select()
      .single()

    if (reportError) throw reportError

    return NextResponse.json({
      report,
      message: 'Report queued successfully. Processing asynchronously.',
      queued: true
    }, { status: 202 })
  } catch (error: any) {
    console.error('Error queueing LLM report:', error)
    return NextResponse.json(
      { error: 'Failed to queue report' },
      { status: 500 }
    )
  }
}

async function processPendingReports(request: Request) {
  try {
    const url = new URL(request.url)
    const includeEmailPayloads =
      process.env.N8N_EMAIL_PAYLOAD_EXPORT_ENABLED === 'true' &&
      url.searchParams.get('include_email_payloads') === '1'
    const llmProvider = process.env.LLM_PROVIDER || 'demo'
    const internalToken = process.env.INTERNAL_API_TOKEN
    if (!internalToken) {
      return NextResponse.json({ error: 'INTERNAL_API_TOKEN is not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('x-internal-token')
    if (authHeader !== internalToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase service credentials are missing' }, { status: 500 })
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    let automaticallyQueued = 0
    if (process.env.LLM_AUTO_QUEUE_ENABLED === 'true') {
      const configuredSince = process.env.LLM_AUTO_QUEUE_SINCE
      const autoQueueSince = configuredSince && !Number.isNaN(Date.parse(configuredSince))
        ? new Date(configuredSince).toISOString()
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data: completedSessions, error: completedSessionsError } = await serviceClient
        .from('sessions')
        .select('id, org_id, device_id, created_by, ended_at, predictions(id)')
        .eq('status', 'done')
        .gte('ended_at', autoQueueSince)
        .order('ended_at', { ascending: false })
        .limit(100)

      if (completedSessionsError) throw completedSessionsError

      const eligibleSessions = (completedSessions || []).filter(
        (session: any) => session.created_by && session.predictions?.length > 0
      )
      const eligibleSessionIds = eligibleSessions.map((session: any) => session.id)

      if (eligibleSessionIds.length > 0) {
        const { data: existingReports, error: existingReportsError } = await serviceClient
          .from('llm_reports')
          .select('session_id')
          .in('session_id', eligibleSessionIds)

        if (existingReportsError) throw existingReportsError

        const coveredSessionIds = new Set(
          (existingReports || []).map((report: any) => report.session_id)
        )
        const missingReports = eligibleSessions
          .filter((session: any) => !coveredSessionIds.has(session.id))
          .map((session: any) => ({
            id: randomUUID(),
            org_id: session.org_id,
            session_id: session.id,
            device_id: session.device_id,
            requested_by: session.created_by,
            status: 'pending',
            prompt_text: 'Automatically queued after session completion; prompt assembled by the report worker.',
            report_text: '',
            model_name: llmProvider === 'demo' ? 'demo-template' : llmProvider,
            model_version: llmProvider === 'demo' ? 'v1' : 'unconfigured',
            retry_count: 0,
            max_retries: 3,
            next_retry_at: null,
            last_error_at: null,
          }))

        if (missingReports.length > 0) {
          const { data: insertedReports, error: autoQueueError } = await serviceClient
            .from('llm_reports')
            .insert(missingReports)
            .select('id')

          if (autoQueueError) throw autoQueueError
          automaticallyQueued = insertedReports?.length || 0
        }
      }
    }

    const { data: pendingReports, error: pendingError } = await serviceClient
      .from('llm_reports')
      .select('id, session_id, device_id, retry_count, max_retries, next_retry_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(3)

    if (pendingError) throw pendingError

    if (!pendingReports || pendingReports.length === 0) {
      return NextResponse.json({
        automatically_queued: automaticallyQueued,
        processed: 0,
        message: 'No pending reports found'
      })
    }

    const now = Date.now()
    const readyReports = pendingReports.filter((r: any) => {
      if (!r.next_retry_at) return true
      return new Date(r.next_retry_at).getTime() <= now
    })

    if (readyReports.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No pending reports are ready for retry yet' })
    }

    let processed = 0
    let failed = 0
    let skipped = 0
    const emails: Array<{
      emailFrom: string
      emailTo: string
      emailSubject: string
      emailText: string
      emailHtml: string
    }> = []

    for (const pending of readyReports) {
      let activeReport: any = pending
      try {
        // Atomic claim: only one worker can transition pending -> generating.
        const { data: claimedReport, error: claimError } = await serviceClient
          .from('llm_reports')
          .update({ status: 'generating', error_message: null })
          .eq('id', pending.id)
          .eq('status', 'pending')
          .select('id, session_id, device_id, retry_count, max_retries, next_retry_at')
          .maybeSingle()

        if (claimError) throw claimError
        if (!claimedReport) {
          skipped += 1
          continue
        }

        activeReport = claimedReport

        const { data: session, error: sessionError } = await serviceClient
          .from('sessions')
          .select(`
            *,
            predictions(*),
            murmur_severity(*),
            device:devices(device_name),
            patient:patients(full_name,email)
          `)
          .eq('id', activeReport.session_id)
          .single()

        if (sessionError || !session) {
          throw new Error('Session not found while processing queued report')
        }

        const generatedReport = await generateLLMReport(session, activeReport.id, serviceClient)
        const recipient = session.patient?.email || process.env.ASCULTICOR_ALERT_EMAIL_TO
        if (recipient && generatedReport?.report_text) {
          emails.push({
            emailFrom: process.env.ASCULTICOR_ALERT_EMAIL_FROM || 'AscultiCor <alerts@localhost>',
            emailTo: recipient,
            emailSubject: '[AscultiCor] AI-assisted session report ready',
            emailText: [
              `Hello${session.patient?.full_name ? ` ${session.patient.full_name}` : ''},`,
              '',
              'Your AscultiCor educational cardiac analysis report is ready.',
              '',
              generatedReport.report_text,
              '',
              `View session: ${(process.env.DEVICE_BOOTSTRAP_PUBLIC_BASE_URL || '').replace(/\/+$/, '')}/session/${session.id}`,
              '',
              'Important: This report is for educational and research purposes only. It is not a medical diagnosis. Always consult a qualified healthcare professional for medical advice.',
            ].join('\n'),
            emailHtml: buildReportEmailHtml(session, generatedReport),
          })
        }
        processed += 1
      } catch (err: any) {
        failed += 1
        const retryCount = (activeReport.retry_count || 0) + 1
        const maxRetries = activeReport.max_retries ?? 3
        const shouldRetry = retryCount <= maxRetries
        const backoffMinutes = Math.min(60, Math.pow(2, Math.max(0, retryCount - 1)))
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

        await serviceClient
          .from('llm_reports')
          .update({
            status: shouldRetry ? 'pending' : 'error',
            retry_count: retryCount,
            next_retry_at: shouldRetry ? nextRetryAt : null,
            last_error_at: new Date().toISOString(),
            error_message: err.message || 'Failed to process report'
          })
          .eq('id', activeReport.id)
      }
    }

    return NextResponse.json({
      automatically_queued: automaticallyQueued,
      processed,
      failed,
      skipped,
      total: readyReports.length,
      email_count: emails.length,
      emails: includeEmailPayloads ? emails : [],
      message: 'Queued report processing completed'
    })
  } catch (error: any) {
    console.error('Error processing pending reports:', error)
    return NextResponse.json(
      { error: 'Failed to process pending reports' },
      { status: 500 }
    )
  }
}

// GET /api/llm/reports - List LLM reports
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'queue-stats') {
      return getQueueStats(request)
    }

    const supabase = createRouteHandlerClient({ cookies })
    const device_id = searchParams.get('device_id')
    const session_id = searchParams.get('session_id')

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Build query
    let query = supabase
      .from('llm_reports')
      .select(`
        *,
        device:devices(device_name),
        session:sessions(status, created_at)
      `)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    if (device_id) {
      query = query.eq('device_id', device_id)
    }

    if (session_id) {
      query = query.eq('session_id', session_id)
    }

    const { data: reports, error } = await query.limit(50)

    if (error) throw error

    return NextResponse.json({ reports: reports || [] })
  } catch (error: any) {
    console.error('Error fetching LLM reports:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    )
  }
}

// Helper function to generate prompt
function generatePrompt(session: any): string {
  const predictions = session.predictions || []
  const pcgPrediction = predictions.find((p: any) => p.modality === 'pcg')
  const ecgPrediction = predictions.find((p: any) => p.modality === 'ecg')
  const murmurData = session.murmur_severity?.[0]

  let prompt = `You are a medical AI assistant analyzing cardiac signal data for educational purposes. 

**IMPORTANT DISCLAIMER**: This analysis is for educational and research purposes only. It is NOT a medical diagnosis. Always consult qualified healthcare professionals for medical advice.

## Session Information
- Device: ${session.device?.device_name || 'Unknown'}
- Date: ${new Date(session.created_at).toLocaleString()}
- Status: ${session.status}

## PCG (Heart Sound) Analysis
`

  if (pcgPrediction) {
    const output = pcgPrediction.output_json
    prompt += `- Classification: ${output?.label || 'N/A'}
- Confidence: ${((output?.probabilities?.[output?.label] || 0) * 100).toFixed(1)}%
- Probabilities: Normal: ${((output?.probabilities?.Normal || 0) * 100).toFixed(1)}%, Murmur: ${((output?.probabilities?.Murmur || 0) * 100).toFixed(1)}%, Artifact: ${((output?.probabilities?.Artifact || 0) * 100).toFixed(1)}%
`
  } else {
    prompt += `- No PCG data available
`
  }

  if (murmurData) {
    prompt += `
## Murmur Severity Details
- Location: ${murmurData.location_json?.predicted || 'N/A'}
- Timing: ${murmurData.timing_json?.predicted || 'N/A'}
- Shape: ${murmurData.shape_json?.predicted || 'N/A'}
- Grading: ${murmurData.grading_json?.predicted || 'N/A'}
- Pitch: ${murmurData.pitch_json?.predicted || 'N/A'}
- Quality: ${murmurData.quality_json?.predicted || 'N/A'}
`
  }

  if (ecgPrediction) {
    const output = ecgPrediction.output_json
    prompt += `
## ECG Analysis
- Prediction: ${output?.prediction || 'N/A'}
- Confidence: ${((output?.confidence || 0) * 100).toFixed(1)}%
`
  } else {
    prompt += `
## ECG Analysis
- No ECG data available
`
  }

  prompt += `
## Request
Please provide:
1. A brief educational summary of the findings (2-3 sentences)
2. Key observations that might be relevant for clinical review
3. Suggested follow-up actions for a healthcare professional to consider
4. Any limitations or caveats about this analysis

Remember to include the medical disclaimer and emphasize this is not a diagnosis.
`

  return prompt
}

function escapeEmailHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function reportList(items: unknown, fallback: string): string {
  const values = Array.isArray(items) && items.length ? items : [fallback]
  return values.map((item) =>
    `<li style="margin:0 0 8px;padding-left:4px;">${escapeEmailHtml(item)}</li>`
  ).join('')
}

function formatReportConfidence(value: unknown): string {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'Not available'
}

function buildReportEmailHtml(session: any, report: any): string {
  const structured = report.report_json || {}
  const pcg = (session.predictions || []).find((item: any) => item.modality === 'pcg')?.output_json || {}
  const ecg = (session.predictions || []).find((item: any) => item.modality === 'ecg')?.output_json || {}
  const observations = structured.key_observations || structured.findings
  const followUp = structured.suggested_follow_up || structured.recommendations
  const summary = structured.summary || 'The AI-assisted report is ready for professional review.'
  const headline = structured.headline || 'AI-assisted session summary'
  const disclaimer = structured.disclaimer || 'This educational report is not a medical diagnosis and must be reviewed by a qualified healthcare professional.'
  const publicBaseUrl = (process.env.DEVICE_BOOTSTRAP_PUBLIC_BASE_URL || 'https://mahmoudmetwall2y.online').replace(/\/+$/, '')
  const sessionUrl = `${publicBaseUrl}/session/${session.id}`
  const completedAt = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo',
  }).format(new Date(report.completed_at || Date.now()))

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:620px){.shell{width:100%!important}.signal-card{display:block!important;width:100%!important}}</style></head>
<body style="margin:0;padding:0;background:#f2f6f8;font-family:Arial,Helvetica,sans-serif;color:#172b40;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your AscultiCor AI-assisted report is ready for professional review.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f8;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" class="shell" width="680" cellspacing="0" cellpadding="0" style="width:680px;max-width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 22px rgba(11,31,58,.08);">
<tr><td style="padding:28px 30px;background:#0b1f3a;border-bottom:5px solid #0f766e;"><div style="color:#7bd3c7;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">AscultiCor · AI-Assisted Report</div><div style="margin-top:8px;color:#fff;font-size:25px;font-weight:800;line-height:1.25;">${escapeEmailHtml(headline)}</div><div style="margin-top:12px;display:inline-block;padding:6px 11px;border-radius:999px;background:#e7f7f4;color:#0f766e;font-size:12px;font-weight:800;">Ready for professional review</div></td></tr>
<tr><td style="padding:22px 30px 8px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fafb;border:1px solid #dce4eb;border-radius:10px;"><tr><td style="padding:14px 16px;color:#607286;font-size:12px;">Patient<br><strong style="color:#172b40;font-size:14px;">${escapeEmailHtml(session.patient?.full_name || 'Not linked')}</strong></td><td style="padding:14px 16px;color:#607286;font-size:12px;">Session<br><strong style="color:#172b40;font-size:14px;">${escapeEmailHtml(String(session.id).slice(0, 8))}</strong></td><td style="padding:14px 16px;color:#607286;font-size:12px;">Generated<br><strong style="color:#172b40;font-size:14px;">${escapeEmailHtml(completedAt)}</strong></td></tr></table></td></tr>
<tr><td style="padding:16px 30px 6px;color:#0b1f3a;font-size:18px;font-weight:800;">Signal overview</td></tr>
<tr><td style="padding:0 24px 18px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td class="signal-card" width="50%" valign="top" style="padding:6px;"><table role="presentation" width="100%" style="border:1px solid #dce4eb;border-top:4px solid #0f766e;border-radius:10px;"><tr><td style="padding:16px;"><div style="color:#607286;font-size:12px;text-transform:uppercase;">PCG classification</div><div style="margin-top:7px;color:#0b1f3a;font-size:20px;font-weight:800;">${escapeEmailHtml(pcg.label || 'Not available')}</div><div style="margin-top:5px;color:#526579;font-size:13px;">Confidence: ${escapeEmailHtml(formatReportConfidence(pcg.confidence ?? pcg.probabilities?.[pcg.label]))}</div></td></tr></table></td>
<td class="signal-card" width="50%" valign="top" style="padding:6px;"><table role="presentation" width="100%" style="border:1px solid #dce4eb;border-top:4px solid #365f91;border-radius:10px;"><tr><td style="padding:16px;"><div style="color:#607286;font-size:12px;text-transform:uppercase;">ECG classification</div><div style="margin-top:7px;color:#0b1f3a;font-size:20px;font-weight:800;">${escapeEmailHtml(ecg.prediction || 'Not available')}</div><div style="margin-top:5px;color:#526579;font-size:13px;">${escapeEmailHtml(formatReportConfidence(ecg.confidence))} confidence${ecg.heart_rate_bpm ? ` · ${escapeEmailHtml(ecg.heart_rate_bpm)} bpm` : ''}</div></td></tr></table></td>
</tr></table></td></tr>
<tr><td style="padding:8px 30px 4px;color:#0b1f3a;font-size:18px;font-weight:800;">Educational summary</td></tr><tr><td style="padding:0 30px 18px;color:#314459;font-size:14px;line-height:1.65;">${escapeEmailHtml(summary)}</td></tr>
<tr><td style="padding:8px 30px 4px;color:#0b1f3a;font-size:16px;font-weight:800;">Key observations</td></tr><tr><td style="padding:0 30px 14px;color:#314459;font-size:14px;line-height:1.55;"><ul style="margin:8px 0 0;padding-left:20px;">${reportList(observations, 'Review the signal classifications and confidence values in the session dashboard.')}</ul></td></tr>
<tr><td style="padding:8px 30px 4px;color:#0b1f3a;font-size:16px;font-weight:800;">Suggested professional follow-up</td></tr><tr><td style="padding:0 30px 14px;color:#314459;font-size:14px;line-height:1.55;"><ul style="margin:8px 0 0;padding-left:20px;">${reportList(followUp, 'Correlate these model outputs with clinical context and qualified professional review.')}</ul></td></tr>
<tr><td style="padding:8px 30px 4px;color:#0b1f3a;font-size:16px;font-weight:800;">Limitations</td></tr><tr><td style="padding:0 30px 18px;color:#526579;font-size:13px;line-height:1.55;"><ul style="margin:8px 0 0;padding-left:20px;">${reportList(structured.limitations, 'Results depend on recording quality, model scope, and available session data.')}</ul></td></tr>
<tr><td align="center" style="padding:4px 30px 24px;"><a href="${escapeEmailHtml(sessionUrl)}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#0f766e;color:#fff;text-decoration:none;font-size:14px;font-weight:800;">Open session report</a></td></tr>
<tr><td style="padding:17px 22px;background:#fff0f1;border-top:1px solid #e7a8af;color:#8b3440;font-size:12px;line-height:1.55;"><strong>Educational use only:</strong> ${escapeEmailHtml(disclaimer)}</td></tr>
<tr><td style="padding:15px 22px;background:#f5f8fa;color:#607286;font-size:11px;">Generated by ${escapeEmailHtml(report.model_name || 'AscultiCor AI')} · No autonomous diagnosis or treatment decision is made.</td></tr>
</table></td></tr></table></body></html>`
}

// ── LLM Report Generation ──────────────────────────────────────────
// Supports: 'openai' (Responses API), 'claude' (AgentRouter), and 'demo' (template).
async function generateLLMReport(session: any, reportId: string, supabase: any) {
  const startMs = Date.now()
  const llmProvider = process.env.LLM_PROVIDER || 'demo'

  const predictions = session.predictions || []
  const pcgPrediction = predictions.find((p: any) => p.modality === 'pcg')
  const ecgPrediction = predictions.find((p: any) => p.modality === 'ecg')

  // ── Try Claude via AgentRouter ──────────────────────────────────
  if (llmProvider === 'openai') {
    try {
      const generated = await callOpenAIAPI(generatePrompt(session))
      return await saveReport(
        supabase, reportId, generated.reportText,
        'openai', process.env.OPENAI_MODEL || 'gpt-5.4-mini',
        startMs, pcgPrediction, ecgPrediction,
        generated.structuredData, generated.tokensUsed
      )
    } catch (err: any) {
      console.error('OpenAI API error, falling back to demo template:', err.message)
    }
  } else if (llmProvider === 'claude') {
    try {
      const reportText = await callClaudeAPI(generatePrompt(session))
      return await saveReport(
        supabase, reportId, reportText,
        'claude', process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250514',
        startMs, pcgPrediction, ecgPrediction
      )
    } catch (err: any) {
      console.error('Claude API error, falling back to demo template:', err.message)
      // Fall through to demo template
    }
  } else if (llmProvider !== 'demo') {
    console.warn(`LLM_PROVIDER=${llmProvider} is not implemented. Falling back to demo template.`)
  }

  // ── Demo template fallback ──────────────────────────────────────
  const reportText = generateDemoReport(pcgPrediction, ecgPrediction)
  return await saveReport(
    supabase, reportId, reportText,
    'demo-template', 'v1',
    startMs, pcgPrediction, ecgPrediction
  )
}

// ── Claude API call via AgentRouter (Anthropic Messages API) ──────
interface StructuredOpenAIReport {
  headline: string
  summary: string
  key_observations: string[]
  suggested_follow_up: string[]
  limitations: string[]
  disclaimer: string
}

async function callOpenAIAPI(prompt: string): Promise<{
  reportText: string
  structuredData: StructuredOpenAIReport
  tokensUsed?: number
}> {
  const apiKey = process.env.OPENAI_API_KEY
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '')
  const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini'

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const response = await fetch(`${baseUrl}/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        'Draft concise educational cardiac-monitoring summaries for qualified professional review.',
        'Use only the supplied session data. Never invent symptoms, history, diagnoses, treatments, or certainty.',
        'Clearly distinguish model outputs from clinical findings and preserve uncertainty.',
        'Do not call AscultiCor a medical device and do not provide a medical diagnosis.',
      ].join(' '),
      input: prompt,
      reasoning: { effort: 'low' },
      max_output_tokens: 1800,
      text: {
        verbosity: 'medium',
        format: {
          type: 'json_schema',
          name: 'asculticor_educational_report',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              headline: { type: 'string' },
              summary: { type: 'string' },
              key_observations: { type: 'array', items: { type: 'string' } },
              suggested_follow_up: { type: 'array', items: { type: 'string' } },
              limitations: { type: 'array', items: { type: 'string' } },
              disclaimer: { type: 'string' },
            },
            required: [
              'headline',
              'summary',
              'key_observations',
              'suggested_follow_up',
              'limitations',
              'disclaimer',
            ],
          },
        },
      },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(`OpenAI API returned ${response.status}: ${data?.error?.message || 'Unknown error'}`)
  }
  const outputText = data.output_text || data.output
    ?.flatMap((item: any) => item?.type === 'message' ? (item.content || []) : [])
    ?.find((item: any) => item?.type === 'output_text')
    ?.text

  if (!outputText) {
    throw new Error('OpenAI API returned no output text')
  }

  const structuredData = JSON.parse(outputText) as StructuredOpenAIReport
  const reportText = [
    `## ${structuredData.headline}`,
    '',
    structuredData.summary,
    '',
    '### Key observations',
    ...structuredData.key_observations.map((item) => `- ${item}`),
    '',
    '### Suggested professional follow-up',
    ...structuredData.suggested_follow_up.map((item) => `- ${item}`),
    '',
    '### Limitations',
    ...structuredData.limitations.map((item) => `- ${item}`),
    '',
    `**Educational disclaimer:** ${structuredData.disclaimer}`,
  ].join('\n')

  return {
    reportText,
    structuredData,
    tokensUsed: data.usage?.total_tokens,
  }
}

async function callClaudeAPI(prompt: string): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY
  const baseUrl = (process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250514'

  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is not configured')
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API returned ${response.status}: ${errorBody}`)
  }

  const data = await response.json()

  // Extract text from Anthropic Messages API response
  const textBlocks = (data.content || []).filter((b: any) => b.type === 'text')
  if (textBlocks.length === 0) {
    throw new Error('Claude API returned no text content')
  }

  return textBlocks.map((b: any) => b.text).join('\n\n')
}

// ── Demo template report ──────────────────────────────────────────
function generateDemoReport(pcgPrediction: any, ecgPrediction: any): string {
  let reportText = `## Educational Analysis Summary

**MEDICAL DISCLAIMER**: This analysis is for educational and research purposes only. It is NOT a medical diagnosis. Always consult qualified healthcare professionals for medical advice.

> **Note**: This report was generated using a template engine (demo mode), not a large language model.

### Findings Overview
`

  if (pcgPrediction?.output_json?.label === 'Normal') {
    reportText += `
The PCG (heart sound) analysis indicates normal heart sounds with regular S1 and S2 patterns. No significant murmurs or abnormal sounds were detected in this recording.

**Key Observations:**
- Normal heart sound classification with ${((pcgPrediction.output_json.probabilities?.Normal || 0) * 100).toFixed(0)}% confidence
- Regular cardiac rhythm detected
- No evidence of valvular abnormalities in the recorded segments
`
  } else if (pcgPrediction?.output_json?.label === 'Murmur') {
    reportText += `
The PCG analysis detected a heart murmur, which is an additional sound during the heartbeat cycle. This finding warrants further clinical evaluation.

**Key Observations:**
- Murmur detected with ${((pcgPrediction.output_json.probabilities?.Murmur || 0) * 100).toFixed(0)}% confidence
- Abnormal sound patterns present in the recording
- Additional analysis may be needed to characterize the murmur
`
  }

  if (ecgPrediction?.output_json?.prediction === 'Normal') {
    reportText += `
### ECG Analysis
The ECG recording shows normal sinus rhythm without significant arrhythmias or conduction abnormalities.

**Key Observations:**
- Normal ECG classification with ${((ecgPrediction.output_json.confidence || 0) * 100).toFixed(0)}% confidence
- Regular rhythm maintained throughout recording
- No critical abnormalities detected
`
  } else if (ecgPrediction?.output_json?.prediction === 'Abnormal') {
    reportText += `
### ECG Analysis
The ECG analysis indicates some irregularities that may warrant further investigation by a healthcare professional.

**Key Observations:**
- Abnormal ECG patterns detected with ${((ecgPrediction.output_json.confidence || 0) * 100).toFixed(0)}% confidence
- Irregularities present in the cardiac rhythm
- Clinical correlation recommended
`
  }

  reportText += `
### Suggested Follow-up

1. **Clinical Review**: Share these recordings with a cardiologist or primary care physician
2. **Comparison**: Compare with previous recordings if available
3. **Additional Testing**: Consider additional cardiac workup if clinically indicated
4. **Patient History**: Correlate findings with patient symptoms and medical history

### Limitations

- This analysis is based on a limited-duration recording
- Environmental factors may affect signal quality
- AI analysis should always be confirmed by medical professionals
- This report was generated using a template engine, not a real LLM

### Technical Notes

- Recording Duration: ~10 seconds
- PCG Sample Rate: 22,050 Hz
- ECG Sample Rate: 500 Hz
- Analysis Mode: Demo/Template (no LLM)

---
*This report was generated by AscultiCor AI (demo mode) for educational purposes only.*
`
  return reportText
}

// ── Save report to database ───────────────────────────────────────
async function saveReport(
  supabase: any,
  reportId: string,
  reportText: string,
  modelName: string,
  modelVersion: string,
  startMs: number,
  pcgPrediction: any,
  ecgPrediction: any,
  structuredOverride?: StructuredOpenAIReport,
  actualTokensUsed?: number,
) {
  const structuredData = structuredOverride || {
    summary: reportText.split('##')[1]?.split('###')[0]?.trim() || 'Analysis completed',
    findings: [
      pcgPrediction?.output_json?.label && `PCG: ${pcgPrediction.output_json.label}`,
      ecgPrediction?.output_json?.prediction && `ECG: ${ecgPrediction.output_json.prediction}`
    ].filter(Boolean),
    recommendations: [
      'Consult healthcare professional',
      'Review with cardiologist',
      'Correlate with clinical symptoms'
    ],
    confidence: {
      pcg: pcgPrediction?.output_json?.probabilities?.[pcgPrediction?.output_json?.label] || 0,
      ecg: ecgPrediction?.output_json?.confidence || 0
    }
  }

  const latencyMs = Date.now() - startMs
  const estimatedTokens = actualTokensUsed || Math.ceil(reportText.length / 4)
  const avgConfidence = [
    pcgPrediction?.output_json?.probabilities?.[pcgPrediction?.output_json?.label],
    ecgPrediction?.output_json?.confidence
  ].filter((v): v is number => typeof v === 'number')
  const confidenceScore = avgConfidence.length > 0
    ? avgConfidence.reduce((a, b) => a + b, 0) / avgConfidence.length
    : 0

  const { data: updatedReport } = await supabase
    .from('llm_reports')
    .update({
      status: 'completed',
      report_text: reportText,
      report_json: structuredData,
      model_name: modelName,
      model_version: modelVersion,
      completed_at: new Date().toISOString(),
      tokens_used: estimatedTokens,
      latency_ms: latencyMs,
      confidence_score: confidenceScore,
      error_message: null,
      retry_count: 0,
      next_retry_at: null,
      last_error_at: null
    })
    .eq('id', reportId)
    .select()
    .single()

  return updatedReport
}

async function getQueueStats(request: Request) {
  const internalToken = process.env.INTERNAL_API_TOKEN
  if (!internalToken) {
    return NextResponse.json({ error: 'INTERNAL_API_TOKEN is not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('x-internal-token')
  if (authHeader !== internalToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase service credentials are missing' }, { status: 500 })
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const [pendingRes, generatingRes, errorRes, retryReadyRes, oldestPendingRes] = await Promise.all([
    serviceClient.from('llm_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    serviceClient.from('llm_reports').select('id', { count: 'exact', head: true }).eq('status', 'generating'),
    serviceClient.from('llm_reports').select('id', { count: 'exact', head: true }).eq('status', 'error'),
    serviceClient.from('llm_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending').lte('next_retry_at', new Date().toISOString()),
    serviceClient.from('llm_reports').select('created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(1).maybeSingle()
  ])

  return NextResponse.json({
    queue: {
      pending: pendingRes.count || 0,
      generating: generatingRes.count || 0,
      error: errorRes.count || 0,
      retry_ready: retryReadyRes.count || 0,
      oldest_pending_created_at: oldestPendingRes.data?.created_at || null
    }
  })
}
