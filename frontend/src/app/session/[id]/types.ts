// ─── Session Report Types ─────────────────────────────────────────────────────
// Shared interfaces for the hierarchical session report components.
// Model 1: pcg_xgboost_classifier  (Heart State — PCG)
// Model 2: murmur_severity_cnn     (Functional Analysis — PCG Severity)
// Model 3: ecg_bilstm_predictor    (Cardiac Rhythm Prediction — ECG)

export interface ReportPrintProps {
  isPrintMode?: boolean
}

/** A single prediction row from Supabase `predictions` table */
export interface Prediction {
  id: string
  modality: string
  model_name: string
  model_version: string
  output_json: any
  latency_ms: number
  created_at: string
}

/** Model 1 — PCG XGBoost: Present Heart State */
export interface Model1Data {
  /** Classification label: 'Normal' | 'Murmur' | 'Artifact' | 'Extrahls' */
  label: string
  confidence?: number
  probabilities?: Record<string, number>
  demo_mode?: boolean
  model_version?: string
  latency_ms?: number
  created_at?: string
}

/** Model 2 — Murmur Severity CNN: Functional Analysis */
export interface Model2Data {
  /** Keys: murmur_timing, murmur_grading, murmur_pitch, murmur_quality, murmur_shape, campaign */
  [key: string]: any
  model_version?: string
  latency_ms?: number
  created_at?: string
}

/** Model 3 — ECG BiLSTM: Cardiac Rhythm Prediction */
export interface Model3Data {
  /** AAMI class prediction: 'Normal' | 'VEB' | 'SVEB' | 'F' | 'Q' | 'Unknown' */
  prediction: string
  beat_type?: string
  confidence?: number
  probabilities?: Record<string, number>
  raw_probabilities?: Record<string, number>
  demo_mode?: boolean
  model_version?: string
  latency_ms?: number
  created_at?: string
}

/** Aggregated hierarchical report context used across components */
export interface HierarchicalReport {
  model1?: Model1Data
  model2?: Model2Data
  model3?: Model3Data
}

/** Extract typed model data from raw predictions array */
export function extractHierarchicalReport(predictions: Prediction[]): HierarchicalReport {
  const report: HierarchicalReport = {}

  for (const p of predictions) {
    if (p.model_name === 'pcg_xgboost_classifier') {
      // Take the latest
      if (!report.model1 || new Date(p.created_at) > new Date(report.model1.created_at || '')) {
        report.model1 = { ...p.output_json, created_at: p.created_at }
      }
    } else if (p.model_name === 'murmur_severity_cnn') {
      if (!report.model2 || new Date(p.created_at) > new Date(report.model2.created_at || '')) {
        report.model2 = { ...p.output_json, created_at: p.created_at }
      }
    } else if (p.model_name === 'ecg_bilstm_predictor') {
      if (!report.model3 || new Date(p.created_at) > new Date(report.model3.created_at || '')) {
        report.model3 = { ...p.output_json, created_at: p.created_at }
      }
    }
  }

  return report
}
