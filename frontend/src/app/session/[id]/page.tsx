'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Heart, Activity, Clock, ChevronLeft, Zap, Cpu,
  CheckCircle, AlertTriangle, Loader2, Trash2, Download,
  FileText, Info
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { PageSkeleton } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'

interface Session {
  id: string
  status: string
  created_at: string
  device_id: string
  ended_at: string | null
}

interface Prediction {
  id: string
  modality: string
  model_name: string
  model_version: string
  output_json: any
  latency_ms: number
  created_at: string
}

interface LiveMetrics {
  metrics_json: {
    waveform?: {
      modality: 'pcg' | 'ecg'
      sample_rate: number
      samples: number[]
    }
    timestamp?: string
  }
  created_at: string
}

// Generate ECG waveform data (demo)
function generateEcgWaveform(count = 120) {
  const data = []
  for (let i = 0; i < count; i++) {
    const t = i / 15
    const cycle = t % 1
    let value = 0
    if (cycle >= 0.0 && cycle < 0.12) value = 0.15 * Math.sin(Math.PI * cycle / 0.12)
    else if (cycle >= 0.16 && cycle < 0.20) value = -0.1
    else if (cycle >= 0.20 && cycle < 0.24) value = 1.0 + (Math.random() - 0.5) * 0.1
    else if (cycle >= 0.24 && cycle < 0.28) value = -0.15
    else if (cycle >= 0.35 && cycle < 0.55) value = 0.3 * Math.sin(Math.PI * (cycle - 0.35) / 0.2)
    else value = 0
    value += (Math.random() - 0.5) * 0.02
    data.push({ time: (i * 0.067).toFixed(2), amplitude: parseFloat(value.toFixed(3)) })
  }
  return data
}

// Generate PCG waveform data (demo)
function generatePcgWaveform(count = 120) {
  const data = []
  for (let i = 0; i < count; i++) {
    const t = i / 15
    const cycle = t % 1
    let value = 0
    if (cycle >= 0.0 && cycle < 0.15) {
      value = 0.8 * Math.sin(2 * Math.PI * cycle / 0.15) * Math.exp(-cycle * 10)
    } else if (cycle >= 0.4 && cycle < 0.55) {
      value = 0.6 * Math.sin(2 * Math.PI * (cycle - 0.4) / 0.15) * Math.exp(-(cycle - 0.4) * 12)
    } else {
      value = 0
    }
    value += (Math.random() - 0.5) * 0.05
    data.push({ time: (i * 0.067).toFixed(2), amplitude: parseFloat(value.toFixed(3)) })
  }
  return data
}

function buildWaveformSeries(samples: number[], sampleRate: number, maxPoints = 200) {
  if (!samples || samples.length === 0 || !sampleRate) return []
  const step = Math.max(1, Math.ceil(samples.length / maxPoints))
  const data = []
  for (let i = 0; i < samples.length; i += step) {
    const t = i / sampleRate
    data.push({
      time: t.toFixed(2),
      amplitude: parseFloat(samples[i].toFixed(3)),
    })
  }
  return data
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  const [session, setSession] = useState<Session | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [ecgData, setEcgData] = useState<any[]>([])
  const [pcgData, setPcgData] = useState<any[]>([])
  const supabase = createClientComponentClient()
  const { showToast } = useToast()

  const fallbackEcg = useMemo(() => generateEcgWaveform(), [])
  const fallbackPcg = useMemo(() => generatePcgWaveform(), [])

  useEffect(() => {
    if (sessionId) {
      fetchSessionData()
      const interval = setInterval(fetchSessionData, 3000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const fetchSessionData = async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessionError) throw sessionError
      setSession(sessionData)

      const { data: predictionsData, error: predError } = await supabase
        .from('predictions')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (predError) throw predError
      setPredictions(predictionsData || [])

      const { data: liveData } = await supabase
        .from('live_metrics')
        .select('metrics_json, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (liveData && liveData.length > 0) {
        const byModality: Record<string, LiveMetrics['metrics_json']['waveform']> = {}
        for (const row of liveData as LiveMetrics[]) {
          const waveform = row.metrics_json?.waveform
          if (waveform && !byModality[waveform.modality]) {
            byModality[waveform.modality] = waveform
          }
        }

        if (byModality.ecg) {
          setEcgData(buildWaveformSeries(byModality.ecg.samples, byModality.ecg.sample_rate))
        }

        if (byModality.pcg) {
          setPcgData(buildWaveformSeries(byModality.pcg.samples, byModality.pcg.sample_rate))
        }
      }
    } catch (error) {
      console.error('Error fetching session data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSession = async () => {
    setDeleting(true)
    try {
      // Delete related predictions first
      await supabase.from('predictions').delete().eq('session_id', sessionId)
      // Delete the session
      const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
      if (error) throw error

      showToast('Session deleted successfully', 'success')
      router.push('/')
    } catch (err: any) {
      showToast(`Failed to delete session: ${err.message}`, 'error')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleExportPDF = () => {
    // Build a printable HTML document and use browser print/PDF
    const printContent = buildPrintReport()
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => printWindow.print(), 500)
    }
  }

  const buildPrintReport = () => {
    const preds = predictions.map(p => {
      const label = p.output_json?.label || p.output_json?.prediction || 'N/A'
      const confidence = p.output_json?.confidence
        ? `${(p.output_json.confidence * 100).toFixed(1)}%`
        : 'N/A'
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${p.modality.toUpperCase()}</td>
          <td style="padding:8px;border:1px solid #ddd;">${p.model_name} v${p.model_version}</td>
          <td style="padding:8px;border:1px solid #ddd;">${label}</td>
          <td style="padding:8px;border:1px solid #ddd;">${confidence}</td>
          <td style="padding:8px;border:1px solid #ddd;">${p.latency_ms}ms</td>
          <td style="padding:8px;border:1px solid #ddd;">${new Date(p.created_at).toLocaleString()}</td>
        </tr>
      `
    }).join('')

    const duration = session?.ended_at
      ? `${Math.round((new Date(session.ended_at).getTime() - new Date(session.created_at).getTime()) / 1000)} seconds`
      : 'In Progress'

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>SONOCARDIA Session Report</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
          h1 { color: #0d9488; font-size: 24px; margin-bottom: 4px; }
          .subtitle { color: #666; font-size: 14px; margin-bottom: 30px; }
          .header-badge { display: inline-block; background: #f0fdfa; color: #0d9488; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          table { border-collapse: collapse; width: 100%; margin-top: 16px; }
          th { background: #f8fafa; padding: 10px 8px; border: 1px solid #ddd; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; }
          td { font-size: 13px; }
          .info-row { display: flex; gap: 30px; margin: 12px 0; font-size: 14px; }
          .info-label { color: #888; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>🫀 SONOCARDIA Session Report</h1>
        <p class="subtitle">AI-Powered Heart Disease Detection & Prediction</p>

        <div style="background:#f8fafa;border-radius:8px;padding:16px;margin-bottom:20px;">
          <div class="info-row">
            <div><span class="info-label">Session ID:</span> <strong>${session?.id.slice(0, 8)}</strong></div>
            <div><span class="info-label">Status:</span> <span class="header-badge">${session?.status}</span></div>
          </div>
          <div class="info-row">
            <div><span class="info-label">Started:</span> ${session ? new Date(session.created_at).toLocaleString() : '—'}</div>
            <div><span class="info-label">Duration:</span> ${duration}</div>
          </div>
          <div class="info-row">
            <div><span class="info-label">Device:</span> ${session?.device_id.slice(0, 8)}</div>
          </div>
        </div>

        <h2 style="font-size:18px;">Predictions (${predictions.length})</h2>
        ${predictions.length === 0
        ? '<p style="color:#999;">No predictions available.</p>'
        : `<table>
              <thead>
                <tr>
                  <th>Modality</th><th>Model</th><th>Result</th><th>Confidence</th><th>Latency</th><th>Time</th>
                </tr>
              </thead>
              <tbody>${preds}</tbody>
            </table>`
      }

        <div class="footer">
          Generated by SONOCARDIA on ${new Date().toLocaleString()} • For educational and research purposes
        </div>
      </body>
      </html>
    `
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { class: string; icon: any }> = {
      created: { class: 'badge-neutral', icon: Clock },
      streaming: { class: 'badge-info', icon: Activity },
      processing: { class: 'badge-warning', icon: Loader2 },
      done: { class: 'badge-success', icon: CheckCircle },
      error: { class: 'badge-danger', icon: AlertTriangle },
    }
    return map[status] || { class: 'badge-neutral', icon: Clock }
  }

  if (loading) {
    return <div className="page-wrapper"><PageSkeleton /></div>
  }

  if (!session) {
    return (
      <div className="page-wrapper">
        <div className="page-content flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Session Not Found</h2>
            <Link href="/" className="text-primary hover:text-primary/80 text-sm font-medium">
              ← Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const statusInfo = getStatusBadge(session.status)
  const StatusIcon = statusInfo.icon

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">

        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {/* Session Header */}
        <div className="bg-card border border-border rounded-xl p-6 fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Heart className="w-5 h-5 text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  Session {session.id.slice(0, 8)}
                </h1>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(session.created_at).toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  Device: {session.device_id.slice(0, 8)}
                </span>
                {session.ended_at && (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Duration: {Math.round((new Date(session.ended_at).getTime() - new Date(session.created_at).getTime()) / 1000)}s
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`badge ${statusInfo.class} text-sm`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {session.status}
              </span>

              {/* Action buttons */}
              <button
                onClick={handleExportPDF}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
                title="Export as PDF"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                title="Delete session"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </div>
        </div>

        {/* Signal Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ECG Waveform */}
          <div className="bg-card border border-border rounded-xl p-6 slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-semibold text-foreground">ECG Waveform</h3>
              </div>
              <span className="badge badge-neutral flex items-center gap-1">
                <Info className="w-3 h-3" />
                {session.status === 'streaming' ? 'Live' : 'Simulated'}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={ecgData.length ? ecgData : fallbackEcg}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  interval={14}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[-0.3, 1.2]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(value: number) => [`${value.toFixed(3)} mV`, 'Amplitude']}
                />
                <defs>
                  <linearGradient id="ecgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="amplitude"
                  stroke="#0d9488"
                  strokeWidth={2}
                  fill="url(#ecgGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* PCG Waveform */}
          <div className="bg-card border border-border rounded-xl p-6 slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'backwards' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <h3 className="font-semibold text-foreground">PCG Waveform</h3>
              </div>
              <span className="badge badge-neutral flex items-center gap-1">
                <Info className="w-3 h-3" />
                {session.status === 'streaming' ? 'Live' : 'Simulated'}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pcgData.length ? pcgData : fallbackPcg}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  interval={14}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[-0.5, 1]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <defs>
                  <linearGradient id="pcgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e11d48" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="amplitude"
                  stroke="#e11d48"
                  strokeWidth={1.5}
                  fill="url(#pcgGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Predictions */}
        <div className="bg-card border border-border rounded-xl slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}>
          <div className="p-6 pb-0">
            <h3 className="font-semibold text-foreground text-lg">Predictions</h3>
            <p className="text-sm text-muted-foreground mt-1">AI-generated analysis results</p>
          </div>

          {predictions.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {session.status === 'streaming' || session.status === 'processing'
                  ? 'Processing... Predictions will appear here.'
                  : 'No predictions available for this session.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border mt-4">
              {predictions.map((prediction) => (
                <div key={prediction.id} className="p-6 hover:bg-accent/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${prediction.modality === 'pcg' ? 'bg-rose-100 dark:bg-rose-950/30' : 'bg-teal-100 dark:bg-teal-950/30'}`}>
                          {prediction.modality === 'pcg'
                            ? <Heart className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                            : <Zap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                          }
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground">
                            {prediction.modality.toUpperCase()} Analysis
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {prediction.model_name} v{prediction.model_version} • {prediction.latency_ms}ms
                          </p>
                        </div>
                      </div>

                      {/* Classification Result */}
                      {prediction.modality === 'pcg' && prediction.output_json?.label && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Classification:</span>
                          <span className={`badge ${prediction.output_json.label === 'Normal' ? 'badge-success' :
                            prediction.output_json.label === 'Murmur' ? 'badge-warning' : 'badge-danger'
                            }`}>
                            {prediction.output_json.label}
                          </span>
                        </div>
                      )}

                      {prediction.modality === 'ecg' && prediction.output_json?.prediction && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Prediction:</span>
                          <span className={`badge ${prediction.output_json.prediction === 'Normal' ? 'badge-success' : 'badge-danger'}`}>
                            {prediction.output_json.prediction}
                          </span>
                          {prediction.output_json.confidence && (
                            <span className="text-xs text-muted-foreground">
                              ({(prediction.output_json.confidence * 100).toFixed(1)}% confidence)
                            </span>
                          )}
                        </div>
                      )}

                      {prediction.output_json?.demo_mode && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                          ⚠ Demo Mode — Using simulated predictions
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(prediction.created_at).toLocaleString()}
                    </p>
                  </div>

                  {/* Probability Bars */}
                  {prediction.output_json?.probabilities && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Probabilities</p>
                      <div className="space-y-2">
                        {Object.entries(prediction.output_json.probabilities).map(
                          ([key, value]: [string, any]) => (
                            <div key={key} className="flex items-center gap-3 text-sm">
                              <span className="w-20 text-muted-foreground text-xs font-medium">{key}</span>
                              <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-500"
                                  style={{ width: `${(value as number) * 100}%` }}
                                />
                              </div>
                              <span className="w-12 text-right text-xs font-semibold text-foreground">
                                {((value as number) * 100).toFixed(1)}%
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Delete Session</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete session <strong>{session.id.slice(0, 8)}</strong> and all its predictions?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors gap-2 inline-flex items-center"
              >
                {deleting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
