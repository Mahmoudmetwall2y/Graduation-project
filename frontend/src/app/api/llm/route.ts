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

// Simple in-memory rate limiter for report generation
const reportQueue = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10; // Max 10 pending reports per user
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = reportQueue.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    reportQueue.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  userLimit.count++;
  return true;
}

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

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 pending reports per hour.' },
        { status: 429 }
      )
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

import OpenAI from 'openai'

// DEMO MODE: Template-based report generation.
// In production, replace this function with actual LLM API calls (e.g., OpenAI, Anthropic).
async function generateLLMReport(session: any, reportId: string, supabase: any) {
  const startMs = Date.now()
  const llmProvider = process.env.LLM_PROVIDER || 'demo'

  if (llmProvider !== 'openai') {
    throw new Error(`LLM_PROVIDER=${llmProvider} is not supported yet by the new integration. Please set it to 'openai'.`);
  }

  // Update status to generating
  await supabase
    .from('llm_reports')
    .update({ status: 'generating', error_message: null })
    .eq('id', reportId)

  // Fetch the prompt that was already generated to the DB
  const { data: report } = await supabase
    .from('llm_reports')
    .select('prompt_text')
    .eq('id', reportId)
    .single();

  const userPrompt = report.prompt_text;

  // Initialize OpenAI Client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let reportText = '';
  let estimatedTokens = 0;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Default to GPT-4o
      messages: [
        { role: "system", content: "You are a specialized medical AI assistant analyzing cardiac signal data (PCG and ECG). Your responses should be professional, highly structured, and strictly educational. You must include a medical disclaimer that this is not a diagnosis. Format your output in clean Markdown." },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
    });

    reportText = completion.choices[0].message.content || 'Failed to generate content.';
    estimatedTokens = completion.usage?.total_tokens || 0;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    throw new Error("Failed to communicate with OpenAI.");
  }


  const structuredData = {
    summary: reportText.substring(0, 150) + '...', // Very basic extraction for the preview
    findings: [],
    recommendations: [],
  };

  const latencyMs = Date.now() - startMs

  const { data: updatedReport } = await supabase
    .from('llm_reports')
    .update({
      status: 'completed',
      report_text: reportText,
      report_json: structuredData,
      completed_at: new Date().toISOString(),
      tokens_used: estimatedTokens,
      latency_ms: latencyMs,
      confidence_score: null, // Confidence scores handled internally by models
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
