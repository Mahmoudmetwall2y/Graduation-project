'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import mqtt, { MqttClient } from 'mqtt'

// ── Types matching contracts/ws_predictions.md ──────────────────────────
export interface PcgSeverity {
  AS: string
  MR: string
  AR: string
  MS: string
  MVP: string
  TC: string
}

export interface PredictionPayload {
  device_id: string
  timestamp: string
  ecg_arrhythmia: string
  pcg_sound: string
  pcg_severity: PcgSeverity
  confidence_score: number
}

interface UseMQTTOptions {
  brokerUrl?: string
  topics?: string[]
  fallbackPollUrl?: string
  fallbackIntervalMs?: number
}

interface UseMQTTReturn {
  connected: boolean
  predictions: Record<string, PredictionPayload>
  lastMessage: PredictionPayload | null
  error: string | null
}

const DEFAULT_BROKER = process.env.NEXT_PUBLIC_MQTT_WS_URL || 'ws://localhost:9001'
const DEFAULT_TOPICS = ['sensors/+/predictions']
const DEFAULT_FALLBACK_URL = '/api/devices'
const DEFAULT_FALLBACK_INTERVAL = 30000

export function useMQTT(options: UseMQTTOptions = {}): UseMQTTReturn {
  const {
    brokerUrl = DEFAULT_BROKER,
    topics = DEFAULT_TOPICS,
    fallbackPollUrl = DEFAULT_FALLBACK_URL,
    fallbackIntervalMs = DEFAULT_FALLBACK_INTERVAL,
  } = options

  const [connected, setConnected] = useState(false)
  const [predictions, setPredictions] = useState<Record<string, PredictionPayload>>({})
  const [lastMessage, setLastMessage] = useState<PredictionPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clientRef = useRef<MqttClient | null>(null)
  const fallbackRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  // ── Fallback polling (triggered when WS is down) ───────────────────
  const startFallbackPolling = useCallback(() => {
    if (fallbackRef.current) return // already polling
    console.warn('[useMQTT] WebSocket down — falling back to HTTP polling')
    fallbackRef.current = setInterval(async () => {
      try {
        const res = await fetch(fallbackPollUrl)
        if (res.ok) {
          const data = await res.json()
          if (isMountedRef.current && data) {
            // Merge polled data into predictions state
            setPredictions((prev) => ({ ...prev, ...data }))
          }
        }
      } catch (err) {
        console.error('[useMQTT] Fallback poll error:', err)
      }
    }, fallbackIntervalMs)
  }, [fallbackPollUrl, fallbackIntervalMs])

  const stopFallbackPolling = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current)
      fallbackRef.current = null
    }
  }, [])

  // ── Main MQTT connection lifecycle ─────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true

    const client = mqtt.connect(brokerUrl, {
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clientId: `asculticor_fe_${Math.random().toString(16).slice(2, 10)}`,
    })

    clientRef.current = client

    client.on('connect', () => {
      if (!isMountedRef.current) return
      console.log('[useMQTT] Connected to', brokerUrl)
      setConnected(true)
      setError(null)
      stopFallbackPolling()

      topics.forEach((topic) => {
        client.subscribe(topic, { qos: 0 }, (err) => {
          if (err) console.error('[useMQTT] Subscribe error:', topic, err)
          else console.log('[useMQTT] Subscribed to', topic)
        })
      })
    })

    client.on('message', (_topic: string, payload: Buffer) => {
      if (!isMountedRef.current) return
      try {
        const parsed: PredictionPayload = JSON.parse(payload.toString())
        setLastMessage(parsed)
        setPredictions((prev) => ({
          ...prev,
          [parsed.device_id]: parsed,
        }))
      } catch (err) {
        console.warn('[useMQTT] Invalid JSON payload:', err)
      }
    })

    client.on('error', (err) => {
      if (!isMountedRef.current) return
      console.error('[useMQTT] Connection error:', err.message)
      setError(err.message)
      setConnected(false)
      startFallbackPolling()
    })

    client.on('offline', () => {
      if (!isMountedRef.current) return
      console.warn('[useMQTT] Client went offline')
      setConnected(false)
      startFallbackPolling()
    })

    client.on('reconnect', () => {
      console.log('[useMQTT] Attempting reconnect...')
    })

    // ── Cleanup ──────────────────────────────────────────────────────
    return () => {
      isMountedRef.current = false
      stopFallbackPolling()
      if (client.connected) {
        client.end(true)
      }
    }
  }, [brokerUrl, topics, startFallbackPolling, stopFallbackPolling])

  return { connected, predictions, lastMessage, error }
}
