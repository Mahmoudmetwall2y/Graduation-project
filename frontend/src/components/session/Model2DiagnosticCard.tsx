import { Stethoscope, Info } from 'lucide-react'
import { Model2Data, ReportPrintProps } from '../../app/session/[id]/types'
import { DataGrid } from './DataGrid'

interface Model2DiagnosticCardProps extends ReportPrintProps {
  data: Model2Data | undefined
  murmurDetected: boolean
}

// Known severity CNN output heads and their display labels
// These map both legacy keys (murmur_timing) and actual CNN keys (systolic_timing)
const SEVERITY_HEAD_LABELS: Record<string, string> = {
  // Actual CNN output keys
  systolic_timing: 'Timing',
  systolic_shape: 'Shape',
  systolic_grading: 'Grading',
  systolic_pitch: 'Pitch',
  systolic_quality: 'Quality',
  murmur_locations: 'Location',
  murmur_present: 'Murmur Present',
  // Legacy / demo keys
  murmur_timing: 'Timing',
  murmur_grading: 'Grading',
  murmur_pitch: 'Pitch',
  murmur_quality: 'Quality',
  murmur_shape: 'Shape',
  campaign: 'Campaign Origin',
}

const RESERVED_KEYS = new Set(['model_name', 'model_version', 'latency_ms', 'demo_mode', 'preprocessing_version', 'created_at'])

/**
 * Model 2 — Murmur Severity CNN: Functional Analysis
 * Displays detailed murmur characteristics from the multi-output CNN model.
 * Only meaningful if Model 1 detected a murmur.
 */
export function Model2DiagnosticCard({ data, murmurDetected, isPrintMode }: Model2DiagnosticCardProps) {
  if (!murmurDetected && !data) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2 opacity-60">
        <Stethoscope className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          Functional analysis is performed when a murmur is detected by Model 1.
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
        <Stethoscope className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          Murmur severity analysis not yet available. Processing...
        </p>
      </div>
    )
  }

  // Build head rows from output_json
  const headKeys = Object.keys(data).filter(k => !RESERVED_KEYS.has(k))

  const gridRows = headKeys.map(key => {
    const headData = data[key]
    const label = SEVERITY_HEAD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    let displayValue: string = '—'
    let subValue: string | undefined

    if (headData && typeof headData === 'object') {
      // Actual CNN output uses 'predicted'; legacy/demo uses 'label'
      const predicted = headData.predicted ?? headData.label
      if (predicted) {
        displayValue = predicted
        // Derive confidence from top probability
        const probs = headData.probabilities
        if (probs && typeof probs === 'object') {
          const topProb = Math.max(...Object.values(probs) as number[])
          subValue = `${(topProb * 100).toFixed(1)}% confidence`
        } else if (headData.confidence !== undefined) {
          subValue = `${(headData.confidence * 100).toFixed(1)}% confidence`
        }
      }
    } else if (typeof headData === 'string' || typeof headData === 'number') {
      displayValue = String(headData)
    }

    return { label, value: displayValue, subValue }
  })

  const metaRows = [
    { label: 'Model', value: 'Murmur Severity CNN' },
    { label: 'Version', value: data.model_version || 'v1.0.0' },
    { label: 'Latency', value: data.latency_ms ? `${data.latency_ms}ms` : 'N/A' },
    { label: 'Timestamp', value: data.created_at ? new Date(data.created_at).toLocaleString() : '—' },
  ]

  return (
    <div className="rounded-xl border-l-4 border-l-violet-500 border border-border bg-[var(--hud-surface-glass)] backdrop-blur-md p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/40">
            <Stethoscope className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Model 2 · Severity CNN</p>
            <h3 className="text-lg font-bold text-foreground mt-0.5">Functional Analysis</h3>
          </div>
        </div>
        <span className="badge badge-warning text-sm">Murmur</span>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Multi-output CNN analysis of murmur characteristics across 6 clinical dimensions.
        </p>
      </div>

      {/* Head-by-head results */}
      {gridRows.length > 0 && (
        <DataGrid rows={gridRows} title="Murmur Characteristics" isPrintMode={isPrintMode} />
      )}

      {/* Metadata */}
      <DataGrid rows={metaRows} title="Model Metadata" isPrintMode={isPrintMode} />

      {data.demo_mode && (
        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
          ⚠ Demo Mode — Using simulated severity predictions.
        </p>
      )}
    </div>
  )
}
