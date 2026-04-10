import { Heart, ShieldCheck, ShieldAlert, AlertCircle, Info } from 'lucide-react'
import { Model1Data, ReportPrintProps } from '../../app/session/[id]/types'
import { DataGrid } from './DataGrid'

interface Model1StateCardProps extends ReportPrintProps {
  data: Model1Data | undefined
}

function getStateStyle(label: string) {
  switch (label.toLowerCase()) {
    case 'normal':
      return {
        icon: ShieldCheck,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
        badgeClass: 'badge-success',
        accent: 'border-l-emerald-500',
        summary: 'No significant cardiac anomaly detected in the phonocardiogram signal.',
      }
    case 'murmur':
      return {
        icon: ShieldAlert,
        iconColor: 'text-amber-600 dark:text-amber-400',
        iconBg: 'bg-amber-50 dark:bg-amber-950/40',
        badgeClass: 'badge-warning',
        accent: 'border-l-amber-500',
        summary: 'Heart murmur detected. Refer to the Functional Analysis below for severity details.',
      }
    default:
      return {
        icon: AlertCircle,
        iconColor: 'text-rose-600 dark:text-rose-400',
        iconBg: 'bg-rose-50 dark:bg-rose-950/40',
        badgeClass: 'badge-danger',
        accent: 'border-l-rose-500',
        summary: 'Abnormal phonocardiogram classification. Clinical review recommended.',
      }
  }
}

/**
 * Model 1 — PCG XGBoost Classifier: Current Cardiac State
 * Displays the primary diagnosis from the phonocardiogram (PCG) recording.
 */
export function Model1StateCard({ data, isPrintMode }: Model1StateCardProps) {
  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
        <Heart className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          PCG analysis not yet available. Awaiting signal processing...
        </p>
      </div>
    )
  }

  const style = getStateStyle(data.label || '')
  const StateIcon = style.icon

  const gridRows = [
    { label: 'Classification', value: data.label, highlight: true },
    {
      label: 'Confidence',
      value: data.confidence !== undefined
        ? `${(data.confidence * 100).toFixed(1)}%`
        : 'N/A',
    },
    { label: 'Model', value: 'PCG XGBoost Classifier' },
    { label: 'Version', value: data.model_version || 'v1.0.0' },
    { label: 'Latency', value: data.latency_ms ? `${data.latency_ms}ms` : 'N/A' },
    {
      label: 'Timestamp',
      value: data.created_at ? new Date(data.created_at).toLocaleString() : '—',
    },
  ]

  return (
    <div className={`rounded-xl border-l-4 ${style.accent} border border-border bg-[var(--hud-surface-glass)] backdrop-blur-md p-6 space-y-5`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${style.iconBg}`}>
            <StateIcon className={`w-6 h-6 ${style.iconColor}`} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Model 1 · PCG Analysis</p>
            <h3 className="text-lg font-bold text-foreground mt-0.5">Current Heart State</h3>
          </div>
        </div>
        <span className={`badge ${style.badgeClass} text-sm`}>{data.label}</span>
      </div>

      {/* Clinical summary */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">{style.summary}</p>
      </div>

      {/* Metrics grid */}
      <DataGrid rows={gridRows} title="Diagnostic Metrics" isPrintMode={isPrintMode} />

      {/* Probability bars */}
      {data.probabilities && Object.keys(data.probabilities).length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Class Probabilities
          </p>
          <div className="space-y-2">
            {Object.entries(data.probabilities)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([cls, prob]) => (
                <div key={cls} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-xs text-muted-foreground font-medium">{cls}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-700"
                      style={{ width: `${(prob as number) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-semibold text-foreground">
                    {((prob as number) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.demo_mode && (
        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
          ⚠ Demo Mode — Using simulated predictions for this session.
        </p>
      )}
    </div>
  )
}
