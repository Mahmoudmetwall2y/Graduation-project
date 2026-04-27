import json
import uuid
from pathlib import Path


OUT_DIR = Path(__file__).parent / "workflows"


def stable_id(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"asculticor-n8n:{name}"))


def manual_node(name: str = "Manual Trigger", x: int = 0, y: int = 0) -> dict:
    return {
        "parameters": {},
        "id": stable_id(name),
        "name": name,
        "type": "n8n-nodes-base.manualTrigger",
        "typeVersion": 1,
        "position": [x, y],
    }


def schedule_node(
    name: str,
    minutes: int | None = None,
    hours: int | None = None,
    daily_hour: int | None = None,
    x: int = 0,
    y: int = 160,
) -> dict:
    if daily_hour is not None:
        interval = [{"field": "days", "triggerAtHour": daily_hour}]
    elif hours is not None:
        interval = [{"field": "hours", "hoursInterval": hours}]
    else:
        interval = [{"field": "minutes", "minutesInterval": minutes or 1}]
    return {
        "parameters": {"rule": {"interval": interval}},
        "id": stable_id(name),
        "name": name,
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [x, y],
    }


def code_node(name: str, code: str, x: int = 300, y: int = 80) -> dict:
    return {
        "parameters": {"jsCode": code.strip() + "\n"},
        "id": stable_id(name),
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x, y],
    }


def gmail_node(name: str = "Send Gmail", x: int = 620, y: int = 80) -> dict:
    return {
        "parameters": {
            "sendTo": "={{$json.emailTo}}",
            "subject": "={{$json.emailSubject}}",
            "message": "={{$json.emailText}}",
            "emailType": "text",
            "options": {
                "appendAttribution": False,
            },
        },
        "id": stable_id(name),
        "name": name,
        "type": "n8n-nodes-base.gmail",
        "typeVersion": 2.1,
        "position": [x, y],
    }


def workflow(name: str, nodes: list[dict], connections: dict) -> dict:
    return {
        "name": name,
        "nodes": nodes,
        "connections": connections,
        "pinData": {},
        "settings": {
            "executionOrder": "v1",
            "timezone": "Africa/Cairo",
        },
        "staticData": None,
        "active": False,
        "versionId": stable_id(f"{name}:version"),
        "id": "",
    }


COMMON_JS = r"""
function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function requiredEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const SUPABASE_URL = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
const SERVICE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const APP_URL = env('ASCULTICOR_PUBLIC_APP_URL', env('DEVICE_BOOTSTRAP_PUBLIC_BASE_URL', 'https://srv1621744.hstgr.cloud')).replace(/\/+$/, '');
const EMAIL_TO = env('ASCULTICOR_ALERT_EMAIL_TO');
const EMAIL_FROM = env('ASCULTICOR_ALERT_EMAIL_FROM', 'AscultiCor <alerts@localhost>');

async function supabase(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function qs(params) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) out.append(key, String(value));
  }
  return out.toString();
}

function get(obj, path, fallback = undefined) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? fallback;
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function emailItem(subject, text, to = EMAIL_TO) {
  if (!to) throw new Error('A recipient email is required before sending email');
  return { json: { emailFrom: EMAIL_FROM, emailTo: to, emailSubject: subject, emailText: text } };
}

async function findOpenAlert(deviceId, sessionId, subtype) {
  const rows = await supabase(`device_alerts?${qs({
    select: '*',
    device_id: `eq.${deviceId}`,
    is_resolved: 'eq.false',
    order: 'created_at.desc',
    limit: 100,
  })}`);
  return (rows || []).find((row) => {
    const metadata = row.metadata || {};
    return metadata.session_id === sessionId && metadata.subtype === subtype;
  });
}

async function insertAlert({ deviceId, orgId, alertType, severity, message, metadata }) {
  const inserted = await supabase('device_alerts?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      device_id: deviceId,
      org_id: orgId,
      alert_type: alertType,
      severity,
      message,
      metadata,
      is_resolved: false,
    },
  });
  return inserted?.[0];
}

async function patientForSession(session) {
  if (!session?.patient_id) return null;
  const rows = await supabase(`patients?${qs({ select: 'id,full_name,email', id: `eq.${session.patient_id}`, limit: 1 })}`);
  return rows?.[0] || null;
}
"""


CONNECTIVITY_JS = COMMON_JS + r"""
const inference = await fetch(env('ASCULTICOR_INFERENCE_URL', 'http://inference:8000') + '/health');
if (!inference.ok) throw new Error(`Inference health failed: ${inference.status}`);
const inferenceBody = await inference.text();

const frontend = await fetch(env('ASCULTICOR_APP_URL', 'http://frontend:3000') + '/api/health');
if (!frontend.ok) throw new Error(`Frontend health failed: ${frontend.status}`);
const frontendBody = await frontend.text();

const reports = await supabase('llm_reports?select=id,status,created_at&limit=1');

return [
  emailItem(
    'AscultiCor n8n connectivity OK',
    [
      'AscultiCor n8n connectivity check passed.',
      '',
      `Inference: ${inference.status} ${inferenceBody.slice(0, 300)}`,
      `Frontend: ${frontend.status} ${frontendBody.slice(0, 300)}`,
      `Supabase llm_reports sample rows: ${(reports || []).length}`,
      `Checked at: ${new Date().toISOString()}`,
    ].join('\n')
  )
];
"""


LLM_JS = COMMON_JS + r"""
const CLAUDE_API_KEY = requiredEnv('CLAUDE_API_KEY');
const CLAUDE_BASE_URL = env('CLAUDE_BASE_URL', 'https://agentrouter.org').replace(/\/+$/, '');
const CLAUDE_MODEL = env('CLAUDE_MODEL', 'claude-sonnet-4-5-20250514');

function confidenceFromPredictions(predictions) {
  const values = [];
  for (const prediction of predictions || []) {
    const out = prediction.output_json || {};
    if (prediction.modality === 'pcg' && out.label && out.probabilities?.[out.label] !== undefined) {
      values.push(Number(out.probabilities[out.label]));
    }
    if (prediction.modality === 'ecg' && out.confidence !== undefined) {
      values.push(Number(out.confidence));
    }
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildPrompt(session, predictions, murmurRows, device) {
  const pcg = (predictions || []).find((p) => p.modality === 'pcg')?.output_json || {};
  const ecg = (predictions || []).find((p) => p.modality === 'ecg')?.output_json || {};
  const murmur = (murmurRows || [])[0] || {};
  return `You are a medical AI assistant analyzing cardiac signal data for educational purposes.

IMPORTANT DISCLAIMER: This analysis is for educational and research purposes only. It is NOT a medical diagnosis. Always consult qualified healthcare professionals for medical advice.

Session Information:
- Device: ${device?.device_name || 'Unknown'}
- Date: ${session?.created_at || 'Unknown'}
- Status: ${session?.status || 'Unknown'}

PCG Analysis:
- Classification: ${pcg.label || 'N/A'}
- Confidence: ${pcg.label && pcg.probabilities?.[pcg.label] !== undefined ? Math.round(pcg.probabilities[pcg.label] * 100) + '%' : 'N/A'}

Murmur Severity:
- Location: ${get(murmur, 'location_json.predicted', 'N/A')}
- Timing: ${get(murmur, 'timing_json.predicted', 'N/A')}
- Shape: ${get(murmur, 'shape_json.predicted', 'N/A')}
- Grading: ${get(murmur, 'grading_json.predicted', 'N/A')}
- Pitch: ${get(murmur, 'pitch_json.predicted', 'N/A')}
- Quality: ${get(murmur, 'quality_json.predicted', 'N/A')}

ECG Analysis:
- Prediction: ${ecg.prediction || 'N/A'}
- Confidence: ${ecg.confidence !== undefined ? Math.round(ecg.confidence * 100) + '%' : 'N/A'}

Please provide:
1. A brief educational summary of the findings.
2. Key observations for clinical review.
3. Suggested follow-up actions for a healthcare professional.
4. Limitations and caveats.

Emphasize that this is not a diagnosis.`;
}

async function callClaude(prompt) {
  const response = await fetch(`${CLAUDE_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Claude API returned ${response.status}: ${text}`);
  const data = JSON.parse(text);
  const blocks = (data.content || []).filter((block) => block.type === 'text').map((block) => block.text);
  if (!blocks.length) throw new Error('Claude returned no text content');
  return { text: blocks.join('\n\n'), usage: data.usage || null };
}

const nowIso = new Date().toISOString();
const pending = await supabase(`llm_reports?${qs({
  select: '*',
  status: 'eq.pending',
  order: 'created_at.asc',
  limit: 3,
  or: `(next_retry_at.is.null,next_retry_at.lte.${nowIso})`,
})}`);

const results = [];

for (const report of pending || []) {
  let active = report;
  const start = Date.now();
  try {
    const claimed = await supabase(`llm_reports?${qs({
      select: '*',
      id: `eq.${report.id}`,
      status: 'eq.pending',
    })}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { status: 'generating', error_message: null },
    });
    if (!claimed?.length) {
      results.push({ id: report.id, status: 'skipped' });
      continue;
    }
    active = claimed[0];

    const [sessions, predictions, murmurRows, devices] = await Promise.all([
      supabase(`sessions?${qs({ select: '*', id: `eq.${active.session_id}`, limit: 1 })}`),
      supabase(`predictions?${qs({ select: '*', session_id: `eq.${active.session_id}`, order: 'created_at.asc' })}`),
      supabase(`murmur_severity?${qs({ select: '*', session_id: `eq.${active.session_id}`, limit: 1 })}`),
      supabase(`devices?${qs({ select: '*', id: `eq.${active.device_id}`, limit: 1 })}`),
    ]);
    const session = sessions?.[0];
    if (!session) throw new Error(`Session ${active.session_id} not found`);
    const prompt = active.prompt_text || buildPrompt(session, predictions, murmurRows, devices?.[0]);

    const claude = await callClaude(prompt);
    const reportText = claude.text;
    const pcg = (predictions || []).find((p) => p.modality === 'pcg');
    const ecg = (predictions || []).find((p) => p.modality === 'ecg');
    const structured = {
      summary: reportText.split('\n').slice(0, 4).join('\n').trim(),
      findings: [
        pcg?.output_json?.label ? `PCG: ${pcg.output_json.label}` : null,
        ecg?.output_json?.prediction ? `ECG: ${ecg.output_json.prediction}` : null,
      ].filter(Boolean),
      recommendations: [
        'Consult a qualified healthcare professional',
        'Review with a cardiologist when clinically appropriate',
        'Correlate findings with symptoms and clinical history',
      ],
      confidence: {
        score: confidenceFromPredictions(predictions || []),
      },
    };

    await supabase(`llm_reports?${qs({ id: `eq.${active.id}` })}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        status: 'completed',
        report_text: reportText,
        report_json: structured,
        model_name: 'claude',
        model_version: CLAUDE_MODEL,
        completed_at: new Date().toISOString(),
        tokens_used: claude.usage?.output_tokens || Math.ceil(reportText.length / 4),
        latency_ms: Date.now() - start,
        confidence_score: structured.confidence.score,
        error_message: null,
        retry_count: 0,
        next_retry_at: null,
        last_error_at: null,
      },
    });
    const patient = await patientForSession(session);
    const recipient = patient?.email || EMAIL_TO;
    if (recipient) {
      results.push({
        emailFrom: EMAIL_FROM,
        emailTo: recipient,
        emailSubject: '[AscultiCor] Cardiac analysis report ready',
        emailText: [
          `Hello${patient?.full_name ? ` ${patient.full_name}` : ''},`,
          '',
          'Your AscultiCor educational cardiac analysis report is ready.',
          '',
          reportText,
          '',
          `View session: ${APP_URL}/session/${session.id}`,
          '',
          'Important: This report is for educational and research purposes only. It is not a medical diagnosis. Always consult a qualified healthcare professional for medical advice.',
        ].join('\n'),
      });
    }
    results.push({ id: active.id, status: 'completed' });
  } catch (error) {
    const retryCount = Number(active.retry_count || 0) + 1;
    const maxRetries = Number(active.max_retries ?? 3);
    const shouldRetry = retryCount <= maxRetries;
    const backoffMinutes = Math.min(60, Math.pow(2, Math.max(1, retryCount)));
    await supabase(`llm_reports?${qs({ id: `eq.${active.id}` })}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        status: shouldRetry ? 'pending' : 'error',
        retry_count: retryCount,
        next_retry_at: shouldRetry ? new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString() : null,
        last_error_at: new Date().toISOString(),
        error_message: error.message || 'Failed to process LLM report',
      },
    });
    results.push({ id: active.id, status: shouldRetry ? 'retry_scheduled' : 'error', error: error.message });
  }
}

return results.filter((item) => item.emailTo).map((item) => ({ json: item }));
"""


CLINICAL_ALERTS_JS = COMMON_JS + r"""
const since = isoMinutesAgo(10);
const emails = [];

async function deviceName(deviceId) {
  const rows = await supabase(`devices?${qs({ select: 'device_name', id: `eq.${deviceId}`, limit: 1 })}`);
  return rows?.[0]?.device_name || deviceId;
}

async function createClinicalAlert({ session, prediction, subtype, title, message, confidence }) {
  const existing = await findOpenAlert(session.device_id, session.id, subtype);
  if (existing) return;
  const inserted = await insertAlert({
    deviceId: session.device_id,
    orgId: session.org_id,
    alertType: subtype === 'session_error' ? 'error' : 'anomaly_detected',
    severity: subtype === 'session_error' ? 'critical' : 'warning',
    message,
    metadata: {
      session_id: session.id,
      prediction_id: prediction?.id || null,
      subtype,
      modality: prediction?.modality || null,
      confidence,
      source: 'n8n-clinical-alerts',
    },
  });
  if (!inserted) return;
  const name = await deviceName(session.device_id);
  const patient = await patientForSession(session);
  const recipient = patient?.email || EMAIL_TO;
  if (!recipient) return;
  emails.push(emailItem(
    `[AscultiCor] ${title}`,
    [
      `Hello${patient?.full_name ? ` ${patient.full_name}` : ''},`,
      '',
      title,
      '',
      `Device: ${name}`,
      `Session: ${session.id}`,
      `Confidence: ${confidence === null || confidence === undefined ? 'N/A' : Math.round(confidence * 100) + '%'}`,
      `Session link: ${APP_URL}/session/${session.id}`,
      '',
      'This notification is for workflow review and is not a medical diagnosis.',
    ].join('\n'),
    recipient
  ));
}

const predictions = await supabase(`predictions?${qs({ select: '*', created_at: `gte.${since}`, order: 'created_at.desc', limit: 100 })}`);
for (const prediction of predictions || []) {
  const sessions = await supabase(`sessions?${qs({ select: '*', id: `eq.${prediction.session_id}`, limit: 1 })}`);
  const session = sessions?.[0];
  if (!session) continue;
  const output = prediction.output_json || {};
  if (prediction.modality === 'pcg' && output.label === 'Murmur') {
    await createClinicalAlert({
      session,
      prediction,
      subtype: 'pcg_murmur',
      title: 'Warning: Murmur detected',
      message: `Murmur detected for session ${session.id}`,
      confidence: output.probabilities?.Murmur ?? output.probabilities?.[output.label] ?? null,
    });
  }
  if (prediction.modality === 'ecg' && output.prediction === 'Abnormal') {
    await createClinicalAlert({
      session,
      prediction,
      subtype: 'ecg_abnormal',
      title: 'Warning: Abnormal ECG',
      message: `Abnormal ECG detected for session ${session.id}`,
      confidence: output.confidence ?? null,
    });
  }
}

const errorSessions = await supabase(`sessions?${qs({ select: '*', status: 'eq.error', created_at: `gte.${since}`, order: 'created_at.desc', limit: 50 })}`);
for (const session of errorSessions || []) {
  await createClinicalAlert({
    session,
    prediction: null,
    subtype: 'session_error',
    title: 'Critical: Session error',
    message: `Session ${session.id} entered error state`,
    confidence: null,
  });
}

return emails;
"""


DEVICE_HEALTH_JS = COMMON_JS + r"""
const emails = [];
const now = Date.now();

async function latestTelemetry(deviceId) {
  const rows = await supabase(`device_telemetry?${qs({ select: '*', device_id: `eq.${deviceId}`, order: 'recorded_at.desc', limit: 1 })}`);
  return rows?.[0] || null;
}

async function openAlert(deviceId, subtype) {
  const rows = await supabase(`device_alerts?${qs({
    select: '*',
    device_id: `eq.${deviceId}`,
    is_resolved: 'eq.false',
    order: 'created_at.desc',
    limit: 100,
  })}`);
  return (rows || []).find((row) => (row.metadata || {}).subtype === subtype);
}

async function createHealthAlert(device, subtype, alertType, severity, message, metadata = {}) {
  if (await openAlert(device.id, subtype)) return;
  await insertAlert({
    deviceId: device.id,
    orgId: device.org_id,
    alertType,
    severity,
    message,
    metadata: { subtype, source: 'n8n-device-health', ...metadata },
  });
  emails.push(emailItem(
    `[AscultiCor] ${severity.toUpperCase()}: ${message}`,
    [
      message,
      '',
      `Device: ${device.device_name || device.id}`,
      `Status: ${device.status || 'unknown'}`,
      `Last seen: ${device.last_seen_at || 'never'}`,
      `Device link: ${APP_URL}/devices/${device.id}`,
    ].join('\n')
  ));
}

async function resolveAlert(alert) {
  await supabase(`device_alerts?${qs({ id: `eq.${alert.id}` })}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { is_resolved: true, resolved_at: new Date().toISOString() },
  });
}

const devices = await supabase('device_status_overview?select=*&limit=500');
for (const device of devices || []) {
  const lastSeenMs = device.last_seen_at ? Date.parse(device.last_seen_at) : 0;
  const offline = !lastSeenMs || now - lastSeenMs > 5 * 60 * 1000;
  const offlineAlert = await openAlert(device.id, 'device_offline');
  if (offline) {
    await createHealthAlert(device, 'device_offline', 'offline', 'critical', `Device ${device.device_name || device.id} is offline`);
  } else if (offlineAlert) {
    await resolveAlert(offlineAlert);
  }

  const telemetry = await latestTelemetry(device.id);
  const rssi = telemetry?.wifi_rssi ?? device.signal_strength;
  if (typeof rssi === 'number' && rssi < -75) {
    await createHealthAlert(device, 'weak_rssi', 'error', 'warning', `Device ${device.device_name || device.id} has weak WiFi signal`, { wifi_rssi: rssi });
  }
  if (typeof telemetry?.free_heap_bytes === 'number' && telemetry.free_heap_bytes < 30000) {
    await createHealthAlert(device, 'low_heap', 'error', 'warning', `Device ${device.device_name || device.id} has low free heap`, { free_heap_bytes: telemetry.free_heap_bytes });
  }
  if (typeof telemetry?.error_count === 'number' && telemetry.error_count > 0) {
    await createHealthAlert(device, 'device_error_count', 'error', 'warning', `Device ${device.device_name || device.id} reported errors`, { error_count: telemetry.error_count });
  }
}

return emails;
"""


DAILY_DIGEST_JS = COMMON_JS + r"""
const CLAUDE_API_KEY = env('CLAUDE_API_KEY');
const CLAUDE_BASE_URL = env('CLAUDE_BASE_URL', 'https://agentrouter.org').replace(/\/+$/, '');
const CLAUDE_MODEL = env('CLAUDE_MODEL', 'claude-sonnet-4-5-20250514');
const since = isoMinutesAgo(24 * 60);

const [sessions, predictions, alerts, devices] = await Promise.all([
  supabase(`sessions?${qs({ select: '*', created_at: `gte.${since}`, order: 'created_at.desc', limit: 1000 })}`),
  supabase(`predictions?${qs({ select: '*', created_at: `gte.${since}`, order: 'created_at.desc', limit: 2000 })}`),
  supabase(`device_alerts?${qs({ select: '*', is_resolved: 'eq.false', order: 'created_at.desc', limit: 500 })}`),
  supabase('device_status_overview?select=*&limit=500'),
]);

const pcgMurmur = (predictions || []).filter((p) => p.modality === 'pcg' && p.output_json?.label === 'Murmur').length;
const ecgAbnormal = (predictions || []).filter((p) => p.modality === 'ecg' && p.output_json?.prediction === 'Abnormal').length;
const errorSessions = (sessions || []).filter((s) => s.status === 'error').length;
const completedSessions = (sessions || []).filter((s) => s.status === 'done').length;
const offlineDevices = (devices || []).filter((d) => {
  if (!d.last_seen_at) return true;
  return Date.now() - Date.parse(d.last_seen_at) > 5 * 60 * 1000;
});
const reviewSessions = (sessions || []).filter((s) => s.status === 'error').slice(0, 5).map((s) => `${APP_URL}/session/${s.id}`);

let summary = '';
if (CLAUDE_API_KEY) {
  const prompt = `Summarize this AscultiCor operational digest in one concise paragraph. Do not provide medical diagnosis.

Total sessions: ${(sessions || []).length}
Completed sessions: ${completedSessions}
Error sessions: ${errorSessions}
Murmur predictions: ${pcgMurmur}
Abnormal ECG predictions: ${ecgAbnormal}
Unresolved alerts: ${(alerts || []).length}
Offline devices: ${offlineDevices.length}`;
  const response = await fetch(`${CLAUDE_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
  });
  if (response.ok) {
    const data = await response.json();
    summary = (data.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n\n');
  }
}

const body = [
  'AscultiCor daily digest',
  '',
  summary ? `Summary: ${summary}\n` : '',
  `Window: last 24 hours since ${since}`,
  `Total sessions: ${(sessions || []).length}`,
  `Completed sessions: ${completedSessions}`,
  `Error sessions: ${errorSessions}`,
  `Murmur predictions: ${pcgMurmur}`,
  `Abnormal ECG predictions: ${ecgAbnormal}`,
  `Unresolved alerts: ${(alerts || []).length}`,
  `Offline devices: ${offlineDevices.length}`,
  '',
  'Top sessions needing review:',
  ...(reviewSessions.length ? reviewSessions : ['None']),
].filter(Boolean).join('\n');

return [emailItem('[AscultiCor] Daily Digest', body)];
"""


SUMMARY_ENRICHMENT_JS = COMMON_JS + r"""
const since = isoMinutesAgo(7 * 24 * 60);
const sessions = await supabase(`sessions?${qs({ select: '*', status: 'eq.done', created_at: `gte.${since}`, order: 'created_at.asc', limit: 5000 })}`);
const groups = new Map();

for (const session of sessions || []) {
  const date = (session.created_at || '').slice(0, 10);
  const key = `${session.device_id}:${date}`;
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
    });
  }
  const group = groups.get(key);
  group.total_sessions += 1;
  group.total_recordings += 1;
  const predictions = await supabase(`predictions?${qs({ select: '*', session_id: `eq.${session.id}` })}`);
  for (const prediction of predictions || []) {
    if (prediction.modality === 'pcg' && prediction.output_json?.label === 'Normal') group.pcg_normal_count += 1;
    if (prediction.modality === 'pcg' && prediction.output_json?.label === 'Murmur') group.pcg_murmur_count += 1;
    if (prediction.modality === 'ecg' && prediction.output_json?.prediction === 'Normal') group.ecg_normal_count += 1;
    if (prediction.modality === 'ecg' && prediction.output_json?.prediction === 'Abnormal') group.ecg_abnormal_count += 1;
  }
  const reports = await supabase(`llm_reports?${qs({ select: 'id', session_id: `eq.${session.id}`, status: 'eq.completed' })}`);
  group.llm_reports_count += (reports || []).length;
}

const rows = Array.from(groups.values());
if (rows.length) {
  await supabase('device_recording_summaries?on_conflict=device_id,recording_date', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: rows,
  });
}

return [{ json: { updated_dates: rows.length, generated_at: new Date().toISOString() } }];
"""


OPS_MONITORING_JS = COMMON_JS + r"""
const issues = [];

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

try {
  await getJson(env('ASCULTICOR_INFERENCE_URL', 'http://inference:8000') + '/health');
} catch (error) {
  issues.push(`Inference health failed: ${error.message}`);
}

try {
  await getJson(env('ASCULTICOR_INFERENCE_URL', 'http://inference:8000') + '/metrics', {
    'x-internal-token': requiredEnv('ASCULTICOR_INFERENCE_TOKEN'),
  });
} catch (error) {
  issues.push(`Inference metrics failed: ${error.message}`);
}

try {
  const stats = await getJson(env('ASCULTICOR_APP_URL', 'http://frontend:3000') + '/api/llm?action=queue-stats', {
    'x-internal-token': requiredEnv('ASCULTICOR_INTERNAL_API_TOKEN'),
  });
  const queue = stats.queue || {};
  if ((queue.pending || 0) > 10) issues.push(`LLM pending queue is high: ${queue.pending}`);
  if (queue.oldest_pending_created_at && Date.now() - Date.parse(queue.oldest_pending_created_at) > 15 * 60 * 1000) {
    issues.push(`Oldest pending LLM report is older than 15 minutes: ${queue.oldest_pending_created_at}`);
  }
  if ((queue.generating || 0) > 5) issues.push(`Many reports are generating: ${queue.generating}`);
} catch (error) {
  issues.push(`LLM queue stats failed: ${error.message}`);
}

if (!issues.length) return [];
return [emailItem('[AscultiCor] Ops Monitoring Alert', ['AscultiCor ops monitor found issues:', '', ...issues].join('\n'))];
"""


ESCALATION_JS = COMMON_JS + r"""
const olderThan = isoMinutesAgo(30);
const alerts = await supabase(`device_alerts?${qs({
  select: '*',
  is_resolved: 'eq.false',
  severity: 'eq.critical',
  created_at: `lt.${olderThan}`,
  order: 'created_at.asc',
  limit: 100,
})}`);

const emails = [];
for (const alert of alerts || []) {
  const metadata = alert.metadata || {};
  if (metadata.escalated_at) continue;
  const devices = await supabase(`devices?${qs({ select: '*', id: `eq.${alert.device_id}`, limit: 1 })}`);
  const device = devices?.[0];
  const nextMetadata = { ...metadata, escalated_at: new Date().toISOString(), escalation_channel: 'email' };
  await supabase(`device_alerts?${qs({ id: `eq.${alert.id}` })}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { metadata: nextMetadata },
  });
  emails.push(emailItem(
    `[AscultiCor] Escalation: ${alert.message}`,
    [
      'Critical alert still unresolved after 30 minutes.',
      '',
      `Alert: ${alert.message}`,
      `Device: ${device?.device_name || alert.device_id}`,
      `Created at: ${alert.created_at}`,
      `Session: ${metadata.session_id || 'N/A'}`,
      metadata.session_id ? `Session link: ${APP_URL}/session/${metadata.session_id}` : `Device link: ${APP_URL}/devices/${alert.device_id}`,
    ].join('\n')
  ));
}

return emails;
"""


def write_workflows() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    workflows = [
        (
            "00 - AscultiCor Connectivity Check",
            "00-connectivity-check.json",
            [manual_node(), code_node("Connectivity Check", CONNECTIVITY_JS), gmail_node()],
            {"Manual Trigger": {"main": [[{"node": "Connectivity Check", "type": "main", "index": 0}]]}, "Connectivity Check": {"main": [[{"node": "Send Gmail", "type": "main", "index": 0}]]}},
        ),
        (
            "01 - Process Pending LLM Reports",
            "01-process-pending-llm-reports.json",
            [manual_node(), schedule_node("Every Minute", minutes=1), code_node("Process Reports", LLM_JS), gmail_node()],
            {
                "Manual Trigger": {"main": [[{"node": "Process Reports", "type": "main", "index": 0}]]},
                "Every Minute": {"main": [[{"node": "Process Reports", "type": "main", "index": 0}]]},
                "Process Reports": {"main": [[{"node": "Send Gmail", "type": "main", "index": 0}]]},
            },
        ),
        (
            "02 - Clinical Alert Notifications",
            "02-clinical-alert-notifications.json",
            [manual_node(), schedule_node("Every Minute", minutes=1), code_node("Create Clinical Alerts", CLINICAL_ALERTS_JS), gmail_node()],
            {
                "Manual Trigger": {"main": [[{"node": "Create Clinical Alerts", "type": "main", "index": 0}]]},
                "Every Minute": {"main": [[{"node": "Create Clinical Alerts", "type": "main", "index": 0}]]},
                "Create Clinical Alerts": {"main": [[{"node": "Send Gmail", "type": "main", "index": 0}]]},
            },
        ),
        (
            "03 - Device Health Monitoring",
            "03-device-health-monitoring.json",
            [manual_node(), schedule_node("Every Two Minutes", minutes=2), code_node("Monitor Device Health", DEVICE_HEALTH_JS), gmail_node()],
            {
                "Manual Trigger": {"main": [[{"node": "Monitor Device Health", "type": "main", "index": 0}]]},
                "Every Two Minutes": {"main": [[{"node": "Monitor Device Health", "type": "main", "index": 0}]]},
                "Monitor Device Health": {"main": [[{"node": "Send Gmail", "type": "main", "index": 0}]]},
            },
        ),
        (
            "04 - Daily Digest",
            "04-daily-digest.json",
            [manual_node(), schedule_node("Daily 09 Cairo", daily_hour=9), code_node("Build Daily Digest", DAILY_DIGEST_JS), gmail_node()],
            {
                "Manual Trigger": {"main": [[{"node": "Build Daily Digest", "type": "main", "index": 0}]]},
                "Daily 09 Cairo": {"main": [[{"node": "Build Daily Digest", "type": "main", "index": 0}]]},
                "Build Daily Digest": {"main": [[{"node": "Send Gmail", "type": "main", "index": 0}]]},
            },
        ),
        (
            "05 - Recording Summary Enrichment",
            "05-recording-summary-enrichment.json",
            [manual_node(), schedule_node("Every Six Hours", hours=6), code_node("Enrich Summaries", SUMMARY_ENRICHMENT_JS)],
            {
                "Manual Trigger": {"main": [[{"node": "Enrich Summaries", "type": "main", "index": 0}]]},
                "Every Six Hours": {"main": [[{"node": "Enrich Summaries", "type": "main", "index": 0}]]},
            },
        ),
        (
            "06 - Ops Monitoring",
            "06-ops-monitoring.json",
            [manual_node(), schedule_node("Every Five Minutes", minutes=5), code_node("Check Ops", OPS_MONITORING_JS), gmail_node()],
            {
                "Manual Trigger": {"main": [[{"node": "Check Ops", "type": "main", "index": 0}]]},
                "Every Five Minutes": {"main": [[{"node": "Check Ops", "type": "main", "index": 0}]]},
                "Check Ops": {"main": [[{"node": "Send Gmail", "type": "main", "index": 0}]]},
            },
        ),
        (
            "07 - Alert Escalation",
            "07-alert-escalation.json",
            [manual_node(), schedule_node("Every Five Minutes", minutes=5), code_node("Escalate Alerts", ESCALATION_JS), gmail_node()],
            {
                "Manual Trigger": {"main": [[{"node": "Escalate Alerts", "type": "main", "index": 0}]]},
                "Every Five Minutes": {"main": [[{"node": "Escalate Alerts", "type": "main", "index": 0}]]},
                "Escalate Alerts": {"main": [[{"node": "Send Gmail", "type": "main", "index": 0}]]},
            },
        ),
    ]

    for name, filename, nodes, connections in workflows:
        path = OUT_DIR / filename
        path.write_text(json.dumps(workflow(name, nodes, connections), indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_workflows()
