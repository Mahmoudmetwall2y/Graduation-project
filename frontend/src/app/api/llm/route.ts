import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

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

    if (!session_id || !device_id) {
      return NextResponse.json(
        { error: 'Session ID and Device ID are required' },
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
        status: 'pending',
        prompt_text: generatePrompt(session),
        report_text: '',
        model_name: 'gpt-4',
        model_version: '2024-01',
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
      { error: error.message || 'Failed to queue report' },
      { status: 500 }
    )
  }
}

async function processPendingReports(request: Request) {
  try {
    const internalToken = process.env.INTERNAL_API_TOKEN
    if (!internalToken) {
      return NextResponse.json({ error: 'INTERNAL_API_TOKEN is not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('x-internal-token')
    if (authHeader !== internalToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase service credentials are missing' }, { status: 500 })
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: pendingReports, error: pendingError } = await serviceClient
      .from('llm_reports')
      .select('id, session_id, device_id, retry_count, max_retries, next_retry_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20)

    if (pendingError) throw pendingError

    if (!pendingReports || pendingReports.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No pending reports found' })
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

    for (const pending of readyReports) {
      try {
        const { data: session, error: sessionError } = await serviceClient
          .from('sessions')
          .select(`
            *,
            predictions(*),
            murmur_severity(*),
            device:devices(device_name)
          `)
          .eq('id', pending.session_id)
          .single()

        if (sessionError || !session) {
          throw new Error('Session not found while processing queued report')
        }

        await generateLLMReport(session, pending.id, serviceClient)
        processed += 1
      } catch (err: any) {
        failed += 1
        const retryCount = (pending.retry_count || 0) + 1
        const maxRetries = pending.max_retries ?? 3
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
          .eq('id', pending.id)
      }
    }

    return NextResponse.json({
      processed,
      failed,
      total: readyReports.length,
      message: 'Queued report processing completed'
    })
  } catch (error: any) {
    console.error('Error processing pending reports:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process pending reports' },
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
      { error: error.message || 'Failed to fetch reports' },
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

// DEMO MODE: Template-based report generation.
// In production, replace this function with actual LLM API calls (e.g., OpenAI, Anthropic).
async function generateLLMReport(session: any, reportId: string, supabase: any) {
  const startMs = Date.now()

  // Update status to generating
  await supabase
    .from('llm_reports')
    .update({ status: 'generating', error_message: null })
    .eq('id', reportId)

  // Generate template-based report from predictions (no artificial delay)
  const predictions = session.predictions || []
  const pcgPrediction = predictions.find((p: any) => p.modality === 'pcg')
  const ecgPrediction = predictions.find((p: any) => p.modality === 'ecg')

  let reportText = `## Educational Analysis Summary

**⚠️ MEDICAL DISCLAIMER**: This analysis is for educational and research purposes only. It is NOT a medical diagnosis. Always consult qualified healthcare professionals for medical advice.

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

  const structuredData = {
    summary: reportText.split('## Educational Analysis Summary')[1]?.split('###')[0]?.trim() || 'Analysis completed',
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

  // Compute actual metrics (not fake)
  const latencyMs = Date.now() - startMs
  const estimatedTokens = Math.ceil(reportText.length / 4)
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

  const supabaseUrl = process.env.SUPABASE_URL
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
