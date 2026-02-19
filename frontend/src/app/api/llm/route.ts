import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

// POST /api/llm/generate-report - Generate LLM report for a session
export async function POST(request: Request) {
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

    // Check if report already exists
    const { data: existingReport } = await supabase
      .from('llm_reports')
      .select('*')
      .eq('session_id', session_id)
      .eq('status', 'completed')
      .single()

    if (existingReport) {
      return NextResponse.json({
        report: existingReport,
        message: 'Report already exists'
      })
    }

    // Create pending report entry
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
        model_version: '2024-01'
      })
      .select()
      .single()

    if (reportError) throw reportError

    // Trigger async report generation
    // In production, this would be a background job
    // For now, we'll generate it synchronously
    const generatedReport = await generateLLMReport(session, reportId, supabase)

    return NextResponse.json({
      report: generatedReport,
      message: 'Report generated successfully'
    })
  } catch (error: any) {
    console.error('Error generating LLM report:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    )
  }
}

// GET /api/llm/reports - List LLM reports
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { searchParams } = new URL(request.url)
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
    .update({ status: 'generating' })
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
*This report was generated by SONOCARDIA AI (demo mode) for educational purposes only.*
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
  const estimatedTokens = Math.ceil(reportText.length / 4) // Rough chars-to-tokens estimate
  const avgConfidence = [
    pcgPrediction?.output_json?.probabilities?.[pcgPrediction?.output_json?.label],
    ecgPrediction?.output_json?.confidence
  ].filter((v): v is number => typeof v === 'number')
  const confidenceScore = avgConfidence.length > 0
    ? avgConfidence.reduce((a, b) => a + b, 0) / avgConfidence.length
    : 0

  // Update with completed report
  const { data: updatedReport } = await supabase
    .from('llm_reports')
    .update({
      status: 'completed',
      report_text: reportText,
      report_json: structuredData,
      completed_at: new Date().toISOString(),
      tokens_used: estimatedTokens, // Estimated from template length
      latency_ms: latencyMs,        // Real measured latency
      confidence_score: confidenceScore // Average of prediction confidences
    })
    .eq('id', reportId)
    .select()
    .single()

  return updatedReport
}

