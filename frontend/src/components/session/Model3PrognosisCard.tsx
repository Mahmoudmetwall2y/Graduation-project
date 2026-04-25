import { TrendingUp, AlertTriangle, CheckCircle2, FlaskConical } from 'lucide-react'
import { Model3Data, ReportPrintProps } from '../../app/session/[id]/types'
import { DataGrid } from './DataGrid'

interface Model3PrognosisCardProps extends ReportPrintProps {
  data: Model3Data | undefined
}

const AAMI_CONTEXT: Record<string, { label: string; risk: 'low' | 'moderate' | 'high'; description: string; color: string; badgeClass: string }> = {
  Normal: {
    label: 'Normal Sinus Rhythm',
    risk: 'low',
    description: 'No significant arrhythmia detected. Standard rhythm observed.',
    color: 'text-emerald-600 dark:text-emerald-400',
    badgeClass: 'badge-success',
  },
  VEB: {
    label: 'Ventricular Ectopic Beat',
    risk: 'moderate',
    description: 'Premature ventricular complexes detected. Monitoring recommended. Evaluate frequency and clinical context.',
    color: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'badge-warning',
  },
  SVEB: {
    label: 'Supraventricular Ectopic Beat',
    risk: 'moderate',
    description: 'Supraventricular ectopy detected. May be benign but warrants evaluation especially with high frequency.',
    color: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'badge-warning',
  },
  F: {
    label: 'Fusion Beat',
    risk: 'moderate',
    description: 'Fusion beats identified, which may indicate simultaneous activation from multiple foci.',
    color: 'text-orange-600 dark:text-orange-400',
    badgeClass: 'badge-warning',
  },
  Q: {
    label: 'Unclassifiable Beat',
    risk: 'high',
    description: 'Beats could not be reliably classified. Manual review of the raw ECG recording is strongly recommended.',
    color: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'badge-danger',
  },
  Unknown: {
    label: 'Unknown Pattern',
    risk: 'high',
    description: 'ECG pattern did not match known classification. Clinical review required.',
    color: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'badge-danger',
  },
}

const RISK_ICONS = {
  low: CheckCircle2,
  moderate: AlertTriangle,
  high: AlertTriangle,
}

const RISK_BG = {
  low: 'border-l-emerald-500',
  moderate: 'border-l-amber-500',
  high: 'border-l-rose-500',
}

export function Model3PrognosisCard({ data, isPrintMode }: Model3PrognosisCardProps) {
  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
        <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          ECG rhythm analysis not yet available. Awaiting signal processing...
        </p>
      </div>
    )
  }

  const aamiClass = AAMI_CONTEXT[data.prediction] || AAMI_CONTEXT.Unknown
  const RiskIcon = RISK_ICONS[aamiClass.risk]

  const gridRows = [
    { label: 'AAMI Class', value: data.prediction, highlight: true },
    { label: 'Beat Type (Raw)', value: data.beat_type || '-' },
    {
      label: 'Heart Rate',
      value: data.heart_rate_bpm !== undefined && data.heart_rate_bpm !== null
        ? `${Math.round(data.heart_rate_bpm)} bpm`
        : 'N/A',
    },
    {
      label: 'Confidence',
      value: data.confidence !== undefined ? `${(data.confidence * 100).toFixed(1)}%` : 'N/A',
    },
    { label: 'Windows Analyzed', value: data.windows_analyzed ?? 'N/A' },
    { label: 'Risk Level', value: aamiClass.risk.charAt(0).toUpperCase() + aamiClass.risk.slice(1) },
    { label: 'Model', value: 'ECG BiLSTM Predictor' },
    { label: 'Version', value: data.model_version || 'v1.0.0' },
    { label: 'Latency', value: data.latency_ms ? `${data.latency_ms}ms` : 'N/A' },
    {
      label: 'Timestamp',
      value: data.created_at ? new Date(data.created_at).toLocaleString() : '-',
    },
  ]

  return (
    <div className={`rounded-xl border-l-4 ${RISK_BG[aamiClass.risk]} border border-border bg-[var(--hud-surface-glass)] backdrop-blur-md p-6 space-y-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40">
            <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Model 3 - ECG BiLSTM</p>
            <h3 className="text-lg font-bold text-foreground mt-0.5">Cardiac Rhythm and Prognosis</h3>
          </div>
        </div>
        <span className={`badge ${aamiClass.badgeClass} text-sm`}>{data.prediction}</span>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3">
        <RiskIcon className={`w-4 h-4 shrink-0 mt-0.5 ${aamiClass.color}`} />
        <div>
          <p className="text-sm font-semibold text-foreground">{aamiClass.label}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{aamiClass.description}</p>
        </div>
      </div>

      <DataGrid rows={gridRows} title="Rhythm Metrics" isPrintMode={isPrintMode} />

      {data.probabilities && Object.keys(data.probabilities).length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            AAMI Risk Distribution
          </p>
          <div className="space-y-2">
            {Object.entries(data.probabilities)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([cls, prob]) => {
                const ctx = AAMI_CONTEXT[cls]
                const barColor = ctx?.risk === 'low'
                  ? 'from-emerald-500 to-emerald-400'
                  : ctx?.risk === 'high'
                    ? 'from-rose-500 to-rose-400'
                    : 'from-amber-500 to-amber-400'
                return (
                  <div key={cls} className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-xs text-muted-foreground font-medium">{cls}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                        style={{ width: `${(prob as number) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs font-semibold text-foreground">
                      {((prob as number) * 100).toFixed(1)}%
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-3">
        <FlaskConical className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>AI Advisory:</strong> This rhythm classification is generated by an AI model trained on the MIT-BIH Arrhythmia Dataset.
          It is intended as a clinical decision support tool only and should be reviewed by a qualified healthcare professional before any clinical action is taken.
        </p>
      </div>

      {data.demo_mode && (
        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
          Warning: Demo mode is active for this ECG prediction.
        </p>
      )}
    </div>
  )
}
