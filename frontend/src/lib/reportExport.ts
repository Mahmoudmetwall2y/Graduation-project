export interface ExportPrediction {
  modality?: string
  model_name?: string
  model_version?: string
  output_json?: Record<string, any> | null
  latency_ms?: number | null
  created_at?: string
}

export interface ExportLlmReport {
  status?: string
  model_name?: string | null
  model_version?: string | null
  report_text?: string | null
  report_json?: Record<string, any> | null
  completed_at?: string | null
}

export interface ExportSession {
  id: string
  status?: string
  created_at: string
  ended_at?: string | null
  device_id?: string | null
  device?: { device_name?: string | null } | null
  patient?: {
    full_name?: string | null
    mrn?: string | null
    dob?: string | null
  } | null
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function list(items: unknown, fallback: string): string {
  const values = Array.isArray(items) && items.length ? items : [fallback]
  return values.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
}

function confidence(value: unknown): string {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'Not available'
}

export function buildSessionReportDocument(input: {
  session: ExportSession
  predictions?: ExportPrediction[]
  report?: ExportLlmReport | null
  deidentify?: boolean
  notes?: string[]
}): string {
  const { session, report, deidentify = false } = input
  const predictions = input.predictions || []
  const structured = report?.report_json || {}
  const pcg = predictions.find((item) => item.modality === 'pcg')?.output_json || {}
  const ecg = predictions.find((item) => item.modality === 'ecg')?.output_json || {}
  const headline = structured.headline || 'AI-assisted cardiac signal report'
  const summary = structured.summary || report?.report_text || 'No completed AI-assisted report is available for this session.'
  const observations = structured.key_observations || structured.findings
  const followUp = structured.suggested_follow_up || structured.recommendations
  const limitations = structured.limitations
  const disclaimer = structured.disclaimer || 'This educational report is not a medical diagnosis and must be reviewed by a qualified healthcare professional.'
  const patientName = deidentify ? 'De-identified' : (session.patient?.full_name || 'Not linked')
  const generatedAt = report?.completed_at || new Date().toISOString()
  const deviceName = session.device?.device_name || session.device_id?.slice(0, 8) || 'Not available'
  const notes = deidentify ? [] : (input.notes || [])

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AscultiCor AI-Assisted Session Report</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#eef3f6;color:#172b40;font-family:Arial,Helvetica,sans-serif;line-height:1.55}
  .page{width:820px;max-width:100%;margin:24px auto;background:#fff;box-shadow:0 8px 28px rgba(11,31,58,.12)}
  .header{padding:30px 34px;background:#0b1f3a;border-bottom:6px solid #0f766e;color:#fff}
  .eyebrow{color:#7bd3c7;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}.header h1{font-size:25px;line-height:1.25;margin:8px 0 12px}
  .badge{display:inline-block;padding:5px 10px;border-radius:999px;background:#e7f7f4;color:#0f766e;font-size:11px;font-weight:800}
  .content{padding:24px 34px 30px}.meta{width:100%;border-collapse:separate;border-spacing:0;background:#f7fafb;border:1px solid #dce4eb;border-radius:10px;overflow:hidden}
  .meta td{padding:12px 14px;border-right:1px solid #dce4eb;color:#607286;font-size:11px}.meta td:last-child{border-right:0}.meta strong{display:block;color:#172b40;font-size:13px;margin-top:2px}
  h2{margin:24px 0 10px;color:#0b1f3a;font-size:17px;border-bottom:2px solid #e5ecef;padding-bottom:6px}p{margin:0;color:#314459;font-size:13px}
  .signals{width:100%;border-spacing:10px;margin:0 -10px}.signal{width:50%;padding:15px;border:1px solid #dce4eb;border-top:4px solid #0f766e;border-radius:9px}.signal.ecg{border-top-color:#365f91}
  .signal-label{color:#607286;font-size:10px;font-weight:700;text-transform:uppercase}.signal-value{margin-top:5px;color:#0b1f3a;font-size:19px;font-weight:800}.signal-detail{color:#526579;font-size:12px}
  ul{margin:8px 0 0;padding-left:20px;color:#314459;font-size:13px}li{margin-bottom:7px}.disclaimer{margin-top:24px;padding:14px 16px;background:#fff0f1;border:1px solid #e7a8af;border-radius:8px;color:#8b3440;font-size:11px}
  .footer{padding:14px 34px;background:#f5f8fa;color:#607286;font-size:10px;text-align:center}.notes{white-space:pre-wrap}
  @media print{body{background:#fff}.page{width:auto;margin:0;box-shadow:none}.content{padding-top:20px}@page{size:A4;margin:10mm}}
</style></head><body><main class="page">
  <header class="header"><div class="eyebrow">AscultiCor · AI-Assisted Report</div><h1>${escapeHtml(headline)}</h1><span class="badge">Ready for professional review</span></header>
  <section class="content">
    <table class="meta"><tr><td>Patient<strong>${escapeHtml(patientName)}</strong></td><td>Session<strong>${escapeHtml(session.id.slice(0, 8))}</strong></td><td>Device<strong>${escapeHtml(deviceName)}</strong></td><td>Generated<strong>${escapeHtml(new Date(generatedAt).toLocaleString())}</strong></td></tr></table>
    ${!deidentify && (session.patient?.mrn || session.patient?.dob) ? `<p style="margin-top:10px;color:#607286;font-size:11px;">${session.patient?.mrn ? `MRN: <strong>${escapeHtml(session.patient.mrn)}</strong>` : ''}${session.patient?.mrn && session.patient?.dob ? ' · ' : ''}${session.patient?.dob ? `DOB: <strong>${escapeHtml(session.patient.dob)}</strong>` : ''}</p>` : ''}
    <h2>Signal overview</h2><table class="signals"><tr>
      <td class="signal"><div class="signal-label">PCG classification</div><div class="signal-value">${escapeHtml(pcg.label || 'Not available')}</div><div class="signal-detail">${escapeHtml(confidence(pcg.confidence ?? pcg.probabilities?.[pcg.label]))} confidence</div></td>
      <td class="signal ecg"><div class="signal-label">ECG classification</div><div class="signal-value">${escapeHtml(ecg.prediction || ecg.label || 'Not available')}</div><div class="signal-detail">${escapeHtml(confidence(ecg.confidence))} confidence${ecg.heart_rate_bpm ? ` · ${escapeHtml(ecg.heart_rate_bpm)} bpm` : ''}</div></td>
    </tr></table>
    <h2>Educational summary</h2><p>${escapeHtml(summary)}</p>
    <h2>Key observations</h2><ul>${list(observations, 'Review the signal classifications and confidence values with the original recordings.')}</ul>
    <h2>Suggested professional follow-up</h2><ul>${list(followUp, 'Correlate these automated outputs with clinical context and qualified professional review.')}</ul>
    <h2>Limitations</h2><ul>${list(limitations, 'Results depend on recording quality, model scope, and the session data available to the report generator.')}</ul>
    ${notes.length ? `<h2>Session notes</h2><div class="notes"><ul>${list(notes, '')}</ul></div>` : ''}
    <div class="disclaimer"><strong>Educational use only:</strong> ${escapeHtml(disclaimer)}</div>
  </section>
  <footer class="footer">Generated by ${escapeHtml(report?.model_name || 'AscultiCor')} ${escapeHtml(report?.model_version || '')} · No autonomous diagnosis or treatment decision is made.</footer>
</main></body></html>`
}
