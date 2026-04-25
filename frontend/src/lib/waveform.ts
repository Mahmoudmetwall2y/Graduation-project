/**
 * Shared waveform utility functions
 * Used by dashboard and session detail pages for generating demo waveforms
 * and converting raw sample data into chart-ready series.
 */

export interface WaveformPoint {
  time: string
  amplitude: number
}

function buildWaveformPoints(samples: number[], sampleRate: number): WaveformPoint[] {
  return samples.map((sample, index) => ({
    time: (index / sampleRate).toFixed(2),
    amplitude: parseFloat(sample.toFixed(3)),
  }))
}

/** Generate synthetic ECG waveform samples (demo/fallback) */
export function generateEcgWaveformSamples(count = 120) {
  const samples: number[] = []
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
    samples.push(value)
  }
  return samples
}

/** Generate synthetic ECG waveform data (demo/fallback) */
export function generateEcgWaveform(count = 120) {
  return buildWaveformPoints(generateEcgWaveformSamples(count), 15)
}

/** Generate synthetic PCG waveform samples (demo/fallback) */
export function generatePcgWaveformSamples(count = 120) {
  const samples: number[] = []
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
    samples.push(value)
  }
  return samples
}

/** Generate synthetic PCG waveform data (demo/fallback) */
export function generatePcgWaveform(count = 120) {
  return buildWaveformPoints(generatePcgWaveformSamples(count), 15)
}

/** Convert raw sample buffer + sample rate into chart-ready { time, amplitude } series */
export function buildWaveformSeries(samples: number[], sampleRate: number, maxPoints = 200, timeOffset = 0) {
  if (!samples || samples.length === 0 || !sampleRate) return []
  const step = Math.max(1, Math.ceil(samples.length / maxPoints))
  const data = []
  for (let i = 0; i < samples.length; i += step) {
    const t = timeOffset + (i / sampleRate)
    data.push({
      time: t.toFixed(2),
      amplitude: parseFloat(samples[i].toFixed(3)),
    })
  }
  return data
}
