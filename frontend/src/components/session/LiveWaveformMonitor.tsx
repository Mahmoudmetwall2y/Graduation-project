'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
  fallbackSamples: number[]
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
      gain: clamp(0.92 / peak, 0.85, 18),
      softClip: false,
    }
  }

  const deviationSorted = sorted
    .map((value) => Math.abs(value - median))
    .sort((a, b) => a - b)
  const peak = Math.max(percentileFromSorted(deviationSorted, 0.985), 0.02)

  return {
    baseline: median,
    gain: clamp(0.98 / peak, 0.9, 14),
    softClip: true,
  }
}

function transformSampleValue(value: number, transform: TraceTransform) {
  const normalized = (value - transform.baseline) * transform.gain
  if (!transform.softClip) return normalized
  return Math.tanh(normalized * 1.35) / Math.tanh(1.35)
}

export const LiveWaveformMonitor = forwardRef<
  LiveWaveformMonitorHandle,
  LiveWaveformMonitorProps
>(function LiveWaveformMonitor(
  {
    accentColor,
    accentGlow,
    amplitudeRange = [-1.1, 1.1],
    fallbackSampleRate,
    fallbackSamples,
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

  const fallbackSnapshot = useMemo<WaveformReplaySnapshot>(() => ({
    samples: fallbackSamples,
    sampleRate: fallbackSampleRate,
  }), [fallbackSampleRate, fallbackSamples])

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

    const collectVisibleSamples = (
      windowStartIndex: number,
      windowEndIndex: number,
      ringSamples: Float32Array,
      ringIndices: Int32Array,
      validWindowSize: number
    ) => {
      const sampleSpan = Math.max(1, windowEndIndex - windowStartIndex + 1)
      const probeBudget = signalProfile === 'ecg' ? 600 : 900
      const step = Math.max(1, Math.floor(sampleSpan / probeBudget))
      const values: number[] = []

      for (let sampleIndex = windowStartIndex; sampleIndex <= windowEndIndex; sampleIndex += step) {
        const slot = positiveModulo(sampleIndex, validWindowSize)
        if (ringIndices[slot] !== sampleIndex) continue
        values.push(ringSamples[slot])
      }

      if (values.length === 0 || values[values.length - 1] !== ringSamples[positiveModulo(windowEndIndex, validWindowSize)]) {
        const slot = positiveModulo(windowEndIndex, validWindowSize)
        if (ringIndices[slot] === windowEndIndex) {
          values.push(ringSamples[slot])
        }
      }

      return values
    }

    const renderSweepCursor = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const glowWidth = Math.max(28, Math.round(width * sweepGlowFraction))
      const glowGradient = ctx.createLinearGradient(width - glowWidth, 0, width, 0)
      glowGradient.addColorStop(0, 'rgba(255,255,255,0)')
      glowGradient.addColorStop(0.7, accentGlow)
      glowGradient.addColorStop(1, accentColor)

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = glowGradient
      ctx.fillRect(width - glowWidth, 0, glowWidth, height)

      ctx.strokeStyle = accentColor
      ctx.shadowBlur = 18
      ctx.shadowColor = accentGlow
      ctx.lineWidth = sampleLabel === 'PCG' ? 1.2 : 1.8
      ctx.beginPath()
      ctx.moveTo(width - 1.5, 0)
      ctx.lineTo(width - 1.5, height)
      ctx.stroke()
      ctx.restore()
    }

    const clampY = (value: number, minAmplitude: number, amplitudeSpan: number, height: number) => {
      const normalized = (value - minAmplitude) / amplitudeSpan
      const clamped = Math.min(1, Math.max(0, normalized))
      return height - (clamped * height)
    }

    const resolveRepresentativeSample = (
      bucketStartIndex: number,
      bucketEndIndex: number,
      ringSamples: Float32Array,
      ringIndices: Int32Array,
      validWindowSize: number
    ) => {
      let foundAny = false
      let bestIndex = -1
      let bestValue = 0
      let bestMagnitude = -1
      let fallbackIndex = -1
      let fallbackValue = 0

      for (let sampleIndex = bucketStartIndex; sampleIndex <= bucketEndIndex; sampleIndex += 1) {
        const slot = positiveModulo(sampleIndex, validWindowSize)
        if (ringIndices[slot] !== sampleIndex) continue

        const value = ringSamples[slot]
        const magnitude = Math.abs(value)
        foundAny = true
        fallbackIndex = sampleIndex
        fallbackValue = value

        if (magnitude > bestMagnitude) {
          bestMagnitude = magnitude
          bestIndex = sampleIndex
          bestValue = value
        }
      }

      if (!foundAny) return null
      return {
        index: bestIndex >= 0 ? bestIndex : fallbackIndex,
        value: bestIndex >= 0 ? bestValue : fallbackValue,
      }
    }

    const renderLine = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      windowStartIndex: number,
      windowEndIndex: number,
      ringSamples: Float32Array,
      ringIndices: Int32Array,
      validWindowSize: number
    ) => {
      if (windowEndIndex <= windowStartIndex) return

      const [minAmplitude, maxAmplitude] = amplitudeRange
      const amplitudeSpan = Math.max(0.0001, maxAmplitude - minAmplitude)
      const sampleSpan = Math.max(1, windowEndIndex - windowStartIndex + 1)
      const pixels = Math.max(1, Math.floor(width))
      const samplesPerPixel = sampleSpan / pixels
      const transform = buildTraceTransform(
        collectVisibleSamples(
          windowStartIndex,
          windowEndIndex,
          ringSamples,
          ringIndices,
          validWindowSize
        ),
        signalProfile
      )
      const lineGradient = ctx.createLinearGradient(0, 0, width, 0)
      lineGradient.addColorStop(0, 'rgba(255,255,255,0.12)')
      lineGradient.addColorStop(0.12, accentColor)
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

      if (samplesPerPixel <= 1.5) {
        for (let x = 0; x < pixels; x += 1) {
          const relative = pixels <= 1 ? 0 : x / (pixels - 1)
          const sampleIndex = Math.round(windowStartIndex + (relative * (sampleSpan - 1)))
          const slot = positiveModulo(sampleIndex, validWindowSize)
          if (ringIndices[slot] !== sampleIndex) {
            started = false
            continue
          }

          const y = clampY(
            transformSampleValue(ringSamples[slot], transform),
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
        }
      } else {
        let bucketStartIndex = windowStartIndex
        for (let x = 0; x < pixels; x += 1) {
          const nextBucketStart = x === pixels - 1
            ? windowEndIndex + 1
            : Math.floor(windowStartIndex + (((x + 1) / pixels) * sampleSpan))
          const bucketEndIndex = Math.max(bucketStartIndex, nextBucketStart - 1)
          const representative = resolveRepresentativeSample(
            bucketStartIndex,
            bucketEndIndex,
            ringSamples,
            ringIndices,
            validWindowSize
          )

          if (!representative) {
            started = false
            bucketStartIndex = nextBucketStart
            continue
          }

          const y = clampY(
            transformSampleValue(representative.value, transform),
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
          bucketStartIndex = nextBucketStart
        }
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
          const windowStart = windowEnd - windowSamplesRef.current + 1
          renderLine(
            ctx,
            width,
            height,
            windowStart,
            windowEnd,
            ringSamplesRef.current,
            ringIndicesRef.current,
            windowSamplesRef.current
          )

          if (isSessionActive && !stale) {
            renderSweepCursor(ctx, width, height)
          }
        }
      } else if (!isSessionActive) {
        renderSnapshot(ctx, width, height, fallbackSnapshot)
      }

      animationFrame = window.requestAnimationFrame(renderFrame)
    }

    animationFrame = window.requestAnimationFrame(renderFrame)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [
    accentColor,
    accentGlow,
    amplitudeRange,
    fallbackSnapshot,
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
        : 'Demo fallback'
  const activeSampleRate = replaySnapshotRef.current?.sampleRate || sampleRateRef.current || fallbackSampleRate

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        className="relative h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
      >
        <canvas ref={canvasRef} className="block h-full w-full" aria-label={`${sampleLabel} waveform monitor`} />
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
