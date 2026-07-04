'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export interface LiveWaveformFrame {
  modality: 'pcg' | 'ecg'
  sample_rate: number
  sample_start_index: number
  sample_count: number
  sequence: number
  samples: number[]
}

export interface WaveformReplaySnapshot {
  samples: number[]
  sampleRate: number
}

export interface LiveWaveformMonitorHandle {
  appendFrames: (frames: LiveWaveformFrame[]) => void
  showSnapshot: (snapshot: WaveformReplaySnapshot) => void
  reset: () => void
}

interface LiveWaveformMonitorProps {
  accentColor: string
  accentGlow: string
  amplitudeRange?: [number, number]
  fallbackSampleRate: number
  isSessionActive: boolean
  playbackLatencyMs?: number
  sampleLabel: string
  staleAfterMs?: number
  sweepGlowFraction?: number
  visibleDurationSec: number
}

function positiveModulo(value: number, mod: number) {
  const result = value % mod
  return result < 0 ? result + mod : result
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function percentileFromSorted(sorted: number[], fraction: number) {
  if (!sorted.length) return 0
  const index = clamp(
    Math.round((sorted.length - 1) * fraction),
    0,
    sorted.length - 1
  )
  return sorted[index]
}

type SignalProfile = 'ecg' | 'pcg'

interface TraceTransform {
  baseline: number
  gain: number
  softClip: boolean
}

function buildTraceTransform(samples: number[], profile: SignalProfile): TraceTransform {
  if (!samples.length) {
    return {
      baseline: 0,
      gain: 1,
      softClip: profile === 'pcg',
    }
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const median = percentileFromSorted(sorted, 0.5)

  if (profile === 'ecg') {
    const lower = percentileFromSorted(sorted, 0.04)
    const upper = percentileFromSorted(sorted, 0.96)
    const baseline = (lower + upper) / 2
    const peak = Math.max(
      Math.abs(upper - baseline),
      Math.abs(lower - baseline),
      0.035
    )

    return {
      baseline,
      gain: clamp(0.76 / peak, 0.65, 12),
      softClip: false,
    }
  }

  const deviationSorted = sorted
    .map((value) => Math.abs(value - median))
    .sort((a, b) => a - b)
  const peak = Math.max(percentileFromSorted(deviationSorted, 0.985), 0.02)

  return {
    baseline: median,
    gain: clamp(0.82 / peak, 0.65, 10),
    softClip: true,
  }
}

function transformSampleValue(value: number, transform: TraceTransform) {
  const normalized = (value - transform.baseline) * transform.gain
  if (!transform.softClip) return normalized
  return Math.tanh(normalized * 1.35) / Math.tanh(1.35)
}

const PLOT_PADDING_Y = 18

export const LiveWaveformMonitor = forwardRef<
  LiveWaveformMonitorHandle,
  LiveWaveformMonitorProps
>(function LiveWaveformMonitor(
  {
    accentColor,
    accentGlow,
    amplitudeRange = [-1.1, 1.1],
    fallbackSampleRate,
    isSessionActive,
    playbackLatencyMs = 220,
    sampleLabel,
    staleAfterMs = 1000,
    sweepGlowFraction = 0.12,
    visibleDurationSec,
  },
  ref
) {
  const signalProfile: SignalProfile = sampleLabel === 'PCG' ? 'pcg' : 'ecg'
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ringSamplesRef = useRef<Float32Array | null>(null)
  const ringIndicesRef = useRef<Int32Array | null>(null)
  const sampleRateRef = useRef(fallbackSampleRate)
  const windowSamplesRef = useRef(Math.max(1, Math.round(visibleDurationSec * fallbackSampleRate)))
  const latestLiveSampleIndexRef = useRef<number | null>(null)
  const displayHeadSampleIndexRef = useRef<number | null>(null)
  const lastFrameAtRef = useRef<number | null>(null)
  const lastAnimationTimestampRef = useRef<number | null>(null)
  const lastSequenceRef = useRef(0)
  const hasLiveDataRef = useRef(false)
  const replaySnapshotRef = useRef<WaveformReplaySnapshot | null>(null)
  const [uiClock, setUiClock] = useState(Date.now())

  const resetBuffer = useCallback((sampleRate: number) => {
    const windowSamples = Math.max(1, Math.round(visibleDurationSec * sampleRate))
    windowSamplesRef.current = windowSamples
    sampleRateRef.current = sampleRate
    ringSamplesRef.current = new Float32Array(windowSamples)
    ringIndicesRef.current = new Int32Array(windowSamples)
    ringIndicesRef.current.fill(-1)
    latestLiveSampleIndexRef.current = null
    displayHeadSampleIndexRef.current = null
    lastAnimationTimestampRef.current = null
    lastSequenceRef.current = 0
  }, [visibleDurationSec])

  const ensureBuffer = useCallback((sampleRate: number) => {
    if (
      !ringSamplesRef.current ||
      !ringIndicesRef.current ||
      sampleRateRef.current !== sampleRate ||
      windowSamplesRef.current !== Math.max(1, Math.round(visibleDurationSec * sampleRate))
    ) {
      resetBuffer(sampleRate)
    }
  }, [resetBuffer, visibleDurationSec])

  const appendFrames = (frames: LiveWaveformFrame[]) => {
    if (!frames.length) return

    const orderedFrames = [...frames].sort((a, b) => a.sequence - b.sequence)
    for (const frame of orderedFrames) {
      if (!frame.samples?.length || !frame.sample_rate) continue
      if (frame.sequence <= lastSequenceRef.current) continue

      ensureBuffer(frame.sample_rate)

      const ringSamples = ringSamplesRef.current
      const ringIndices = ringIndicesRef.current
      const windowSamples = windowSamplesRef.current
      if (!ringSamples || !ringIndices || windowSamples <= 0) continue

      const gapThreshold = windowSamples * 4
      const latestKnown = latestLiveSampleIndexRef.current
      if (
        latestKnown !== null &&
        (frame.sample_start_index > latestKnown + gapThreshold ||
          frame.sample_start_index + frame.sample_count < latestKnown - gapThreshold)
      ) {
        resetBuffer(frame.sample_rate)
      }

      const boundedCount = Math.min(frame.samples.length, frame.sample_count || frame.samples.length)
      for (let offset = 0; offset < boundedCount; offset += 1) {
        const absoluteIndex = frame.sample_start_index + offset
        const ringSlot = positiveModulo(absoluteIndex, windowSamples)
        ringSamples[ringSlot] = frame.samples[offset]
        ringIndices[ringSlot] = absoluteIndex
      }

      latestLiveSampleIndexRef.current = Math.max(
        latestLiveSampleIndexRef.current ?? -1,
        frame.sample_start_index + boundedCount - 1
      )
      if (displayHeadSampleIndexRef.current === null) {
        displayHeadSampleIndexRef.current = latestLiveSampleIndexRef.current
      }
      lastFrameAtRef.current = Date.now()
      lastSequenceRef.current = frame.sequence
      hasLiveDataRef.current = true
      replaySnapshotRef.current = null
    }

    setUiClock(Date.now())
  }

  const showSnapshot = (snapshot: WaveformReplaySnapshot) => {
    replaySnapshotRef.current = snapshot
    setUiClock(Date.now())
  }

  useImperativeHandle(ref, () => ({
    appendFrames,
    showSnapshot,
    reset: () => {
      hasLiveDataRef.current = false
      lastFrameAtRef.current = null
      replaySnapshotRef.current = null
      resetBuffer(fallbackSampleRate)
      setUiClock(Date.now())
    },
  }))

  useEffect(() => {
    resetBuffer(fallbackSampleRate)
  }, [fallbackSampleRate, resetBuffer])

  useEffect(() => {
    const ticker = window.setInterval(() => setUiClock(Date.now()), 250)
    return () => window.clearInterval(ticker)
  }, [])

  useEffect(() => {
    const element = wrapperRef.current
    const canvas = canvasRef.current
    if (!element || !canvas) return

    const resize = () => {
      const { width, height } = element.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${Math.max(1, Math.floor(width))}px`
      canvas.style.height = `${Math.max(1, Math.floor(height))}px`
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let animationFrame = 0

    const drawGrid = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number
    ) => {
      const minorVerticalDivisions = signalProfile === 'ecg' ? 25 : 18
      const minorHorizontalDivisions = signalProfile === 'ecg' ? 10 : 8
      const majorStep = signalProfile === 'ecg' ? 5 : 3
      const minorColor = signalProfile === 'ecg'
        ? 'rgba(16, 185, 129, 0.08)'
        : 'rgba(244, 63, 94, 0.08)'
      const majorColor = signalProfile === 'ecg'
        ? 'rgba(16, 185, 129, 0.18)'
        : 'rgba(244, 63, 94, 0.18)'

      ctx.save()
      for (let x = 0; x <= minorVerticalDivisions; x += 1) {
        const isMajor = x % majorStep === 0
        const xPos = (width / minorVerticalDivisions) * x
        ctx.beginPath()
        ctx.moveTo(xPos, 0)
        ctx.lineTo(xPos, height)
        ctx.strokeStyle = isMajor ? majorColor : minorColor
        ctx.lineWidth = isMajor ? 1 : 0.6
        ctx.stroke()
      }

      for (let y = 0; y <= minorHorizontalDivisions; y += 1) {
        const isMajor = y % majorStep === 0
        const yPos = (height / minorHorizontalDivisions) * y
        ctx.beginPath()
        ctx.moveTo(0, yPos)
        ctx.lineTo(width, yPos)
        ctx.strokeStyle = isMajor ? majorColor : minorColor
        ctx.lineWidth = isMajor ? 1 : 0.6
        ctx.stroke()
      }

      ctx.strokeStyle = signalProfile === 'ecg'
        ? 'rgba(226, 232, 240, 0.26)'
        : 'rgba(251, 113, 133, 0.26)'
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.lineWidth = 1.15
      ctx.stroke()
      ctx.restore()
    }

    const renderSweepCursor = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      cursorX: number
    ) => {
      const glowWidth = Math.max(28, Math.round(width * sweepGlowFraction))
      const left = clamp(cursorX - glowWidth * 0.35, 0, width)
      const right = clamp(cursorX + glowWidth * 0.65, 0, width)
      const glowGradient = ctx.createLinearGradient(left, 0, right, 0)
      glowGradient.addColorStop(0, 'rgba(255,255,255,0)')
      glowGradient.addColorStop(0.7, accentGlow)
      glowGradient.addColorStop(1, accentColor)

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = glowGradient
      ctx.fillRect(left, 0, Math.max(1, right - left), height)

      ctx.strokeStyle = accentColor
      ctx.shadowBlur = 18
      ctx.shadowColor = accentGlow
      ctx.lineWidth = sampleLabel === 'PCG' ? 1.2 : 1.8
      ctx.beginPath()
      ctx.moveTo(cursorX, 0)
      ctx.lineTo(cursorX, height)
      ctx.stroke()
      ctx.restore()
    }

    const clampY = (value: number, minAmplitude: number, amplitudeSpan: number, height: number) => {
      const normalized = (value - minAmplitude) / amplitudeSpan
      const clamped = Math.min(1, Math.max(0, normalized))
      const drawableHeight = Math.max(1, height - (PLOT_PADDING_Y * 2))
      return PLOT_PADDING_Y + (1 - clamped) * drawableHeight
    }

    const collectSweepSamples = (
      headIndex: number,
      ringSamples: Float32Array,
      ringIndices: Int32Array,
      validWindowSize: number
    ) => {
      const values: number[] = []
      const stride = Math.max(1, Math.floor(validWindowSize / (signalProfile === 'ecg' ? 700 : 1000)))

      for (let slot = 0; slot < validWindowSize; slot += stride) {
        const sampleIndex = ringIndices[slot]
        if (sampleIndex < 0 || sampleIndex > headIndex) continue
        if (headIndex - sampleIndex >= validWindowSize) continue
        values.push(ringSamples[slot])
      }

      return values
    }

    const resolveSweepRepresentative = (
      bucketStartSlot: number,
      bucketEndSlot: number,
      headIndex: number,
      ringSamples: Float32Array,
      ringIndices: Int32Array,
      validWindowSize: number
    ) => {
      let foundAny = false
      let bestValue = 0
      let bestMagnitude = -1
      let fallbackValue = 0

      for (let slot = bucketStartSlot; slot <= bucketEndSlot; slot += 1) {
        const wrappedSlot = positiveModulo(slot, validWindowSize)
        const sampleIndex = ringIndices[wrappedSlot]
        if (sampleIndex < 0 || sampleIndex > headIndex) continue
        if (headIndex - sampleIndex >= validWindowSize) continue

        const value = ringSamples[wrappedSlot]
        const magnitude = Math.abs(value)
        foundAny = true
        fallbackValue = value
        if (magnitude > bestMagnitude) {
          bestMagnitude = magnitude
          bestValue = value
        }
      }

      if (!foundAny) return null
      return bestMagnitude >= 0 ? bestValue : fallbackValue
    }

    const renderSweepLine = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      headIndex: number,
      ringSamples: Float32Array,
      ringIndices: Int32Array,
      validWindowSize: number
    ) => {
      if (validWindowSize <= 1) return

      const [minAmplitude, maxAmplitude] = amplitudeRange
      const amplitudeSpan = Math.max(0.0001, maxAmplitude - minAmplitude)
      const pixels = Math.max(1, Math.floor(width))
      const transform = buildTraceTransform(
        collectSweepSamples(headIndex, ringSamples, ringIndices, validWindowSize),
        signalProfile
      )
      const lineGradient = ctx.createLinearGradient(0, 0, width, 0)
      lineGradient.addColorStop(0, 'rgba(255,255,255,0.10)')
      lineGradient.addColorStop(0.16, accentColor)
      lineGradient.addColorStop(1, accentColor)

      ctx.save()
      ctx.strokeStyle = lineGradient
      ctx.shadowBlur = 12
      ctx.shadowColor = accentGlow
      ctx.lineWidth = signalProfile === 'pcg' ? 1.05 : 1.65
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()

      let started = false
      let bucketStartSlot = 0
      for (let x = 0; x < pixels; x += 1) {
        const nextBucketStart = x === pixels - 1
          ? validWindowSize
          : Math.floor(((x + 1) / pixels) * validWindowSize)
        const bucketEndSlot = Math.max(bucketStartSlot, nextBucketStart - 1)
        const value = resolveSweepRepresentative(
          bucketStartSlot,
          bucketEndSlot,
          headIndex,
          ringSamples,
          ringIndices,
          validWindowSize
        )

        if (value === null) {
          started = false
          bucketStartSlot = nextBucketStart
          continue
        }

        const y = clampY(
          transformSampleValue(value, transform),
          minAmplitude,
          amplitudeSpan,
          height
        )

        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else {
          ctx.lineTo(x, y)
        }
        bucketStartSlot = nextBucketStart
      }

      ctx.stroke()
      ctx.restore()
    }

    const renderSnapshot = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      snapshot: WaveformReplaySnapshot
    ) => {
      if (!snapshot.samples.length) return
      const [minAmplitude, maxAmplitude] = amplitudeRange
      const amplitudeSpan = Math.max(0.0001, maxAmplitude - minAmplitude)
      const sampleSpan = Math.max(1, snapshot.samples.length - 1)
      const transform = buildTraceTransform(snapshot.samples, signalProfile)
      const lineGradient = ctx.createLinearGradient(0, 0, width, 0)
      lineGradient.addColorStop(0, 'rgba(255,255,255,0.12)')
      lineGradient.addColorStop(0.12, accentColor)
      lineGradient.addColorStop(1, accentColor)

      ctx.save()
      ctx.strokeStyle = lineGradient
      ctx.shadowBlur = 10
      ctx.shadowColor = accentGlow
      ctx.lineWidth = signalProfile === 'pcg' ? 1.05 : 1.65
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()

      for (let x = 0; x < width; x += 1) {
        const relative = width <= 1 ? 0 : x / (width - 1)
        const sampleIndex = Math.round(relative * sampleSpan)
        const value = transformSampleValue(snapshot.samples[sampleIndex] ?? 0, transform)
        const y = clampY(value, minAmplitude, amplitudeSpan, height)
        if (x === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }

      ctx.stroke()
      ctx.restore()
    }

    const renderFrame = (timestamp: number) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const width = canvas.width / dpr
      const height = canvas.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(
        0,
        signalProfile === 'ecg'
          ? 'rgba(5, 150, 105, 0.14)'
          : 'rgba(225, 29, 72, 0.14)'
      )
      gradient.addColorStop(0.45, 'rgba(15, 23, 42, 0.16)')
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0.03)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = 'rgba(255,255,255,0.015)'
      for (let y = 0; y < height; y += 10) {
        ctx.fillRect(0, y, width, 1)
      }

      drawGrid(ctx, width, height)

      const replaySnapshot = replaySnapshotRef.current
      if (replaySnapshot) {
        renderSnapshot(ctx, width, height, replaySnapshot)
      } else if (hasLiveDataRef.current && ringSamplesRef.current && ringIndicesRef.current) {
        const latestSampleIndex = latestLiveSampleIndexRef.current
        if (latestSampleIndex !== null) {
          const lastAnimationTimestamp = lastAnimationTimestampRef.current ?? timestamp
          const deltaMs = Math.max(0, timestamp - lastAnimationTimestamp)
          lastAnimationTimestampRef.current = timestamp

          const lastLiveAt = lastFrameAtRef.current ?? Date.now()
          const stale = isSessionActive && (Date.now() - lastLiveAt) > staleAfterMs
          const playbackLatencySamples = Math.max(
            1,
            Math.round((sampleRateRef.current * playbackLatencyMs) / 1000)
          )
          const targetHead = Math.max(0, latestSampleIndex - playbackLatencySamples)

          if (displayHeadSampleIndexRef.current === null) {
            displayHeadSampleIndexRef.current = targetHead
          } else if (!stale) {
            const advance = (deltaMs * sampleRateRef.current) / 1000
            const currentHead = displayHeadSampleIndexRef.current
            if (currentHead > targetHead + playbackLatencySamples) {
              displayHeadSampleIndexRef.current = targetHead
            } else if (currentHead < targetHead) {
              displayHeadSampleIndexRef.current = Math.min(
                targetHead,
                currentHead + advance
              )
            }
          }

          const windowEnd = Math.floor(displayHeadSampleIndexRef.current ?? latestSampleIndex)
          renderSweepLine(
            ctx,
            width,
            height,
            windowEnd,
            ringSamplesRef.current,
            ringIndicesRef.current,
            windowSamplesRef.current
          )

          if (isSessionActive && !stale) {
            const cursorX = (
              positiveModulo(windowEnd, windowSamplesRef.current) /
              Math.max(1, windowSamplesRef.current - 1)
            ) * width
            renderSweepCursor(ctx, width, height, cursorX)
          }
        }
      }

      animationFrame = window.requestAnimationFrame(renderFrame)
    }

    animationFrame = window.requestAnimationFrame(renderFrame)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [
    accentColor,
    accentGlow,
    amplitudeRange,
    isSessionActive,
    playbackLatencyMs,
    sampleLabel,
    staleAfterMs,
    sweepGlowFraction,
    signalProfile,
  ])

  const isStale = Boolean(
    isSessionActive &&
    hasLiveDataRef.current &&
    lastFrameAtRef.current &&
    uiClock - lastFrameAtRef.current > staleAfterMs
  )
  const footerLabel = replaySnapshotRef.current
    ? 'Captured trace'
    : hasLiveDataRef.current
      ? isSessionActive
        ? isStale
          ? 'Signal stale'
          : 'Live sweep'
        : 'Captured trace'
      : isSessionActive
        ? 'Awaiting live signal'
        : 'No capture yet'
  const activeSampleRate = replaySnapshotRef.current?.sampleRate || sampleRateRef.current || fallbackSampleRate
  const hasDisplayData = Boolean(replaySnapshotRef.current || hasLiveDataRef.current)
  const emptyLabel = isSessionActive ? 'Waiting for ESP32 signal' : 'No captured trace'

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        className="relative h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
      >
        <canvas ref={canvasRef} className="block h-full w-full" aria-label={`${sampleLabel} waveform monitor`} />
        {!hasDisplayData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_0_24px_rgba(15,23,42,0.45)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200/80">
                {emptyLabel}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-400/80">
                Real ESP32 data only
              </p>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-slate-300/75">
          <span>{sampleLabel}</span>
          <span className={isStale ? 'text-amber-300' : 'text-slate-300/75'}>
            {footerLabel}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
        <span>{signalProfile === 'ecg' ? 'Clinical grid' : 'Acoustic sweep'}</span>
        <span>{visibleDurationSec.toFixed(1)}s window</span>
        <span>{activeSampleRate} Hz</span>
      </div>
    </div>
  )
})
