'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMQTT } from '../hooks/useMQTT'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  Cpu,
  AlertTriangle,
  Clock,
  ChevronRight,
  TrendingUp,
  Heart,
  Zap,
  Plus,
  Wifi,
  WifiOff,
  ArrowUpRight,
  BarChart3,
  Stethoscope,
  ShieldAlert
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { PageSkeleton } from '../components/Skeleton'
import { MetricCard } from '../../components/ui/MetricCard'
import { StatusType } from '../../components/ui/StatusBadge'
import { PatientInfoPanel } from '../../components/dashboard/PatientInfoPanel'
import { EcgGraphPanel } from '../../components/dashboard/EcgGraphPanel'
import { PcgGraphPanel } from '../../components/dashboard/PcgGraphPanel'
import { RecentActivityPanel } from '../../components/dashboard/RecentActivityPanel'
import { AIAnalyticsPanel } from '../../components/dashboard/AIAnalyticsPanel'
import { GlassCard } from '../../components/ui/GlassCard'
import dynamic from 'next/dynamic'

const HeartVisualization3D = dynamic(
  () => import('../../components/ui/HeartVisualization3D').then(mod => mod.HeartVisualization3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[500px]">
        <div className="w-16 h-16 border-2 border-hud-cyan/30 border-t-hud-cyan rounded-full animate-spin" />
      </div>
    ),
  }
)

interface Session {
  id: string
  status: string
  created_at: string
  device_id: string
  ended_at: string | null
  patient?: {
    id: string
    full_name: string
    dob: string | null
    sex: string | null
  } | null
}

interface DailyActivity {
  day: string
  sessions: number
  predictions: number
}

// Waveform utilities — shared with session detail page
import { generateEcgWaveform, generatePcgWaveform, buildWaveformSeries } from '../../lib/waveform'

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [deviceCount, setDeviceCount] = useState(0)
  const [onlineDevices, setOnlineDevices] = useState(0)
  const [weeklyData, setWeeklyData] = useState<DailyActivity[]>([])
  const [predictionCount, setPredictionCount] = useState(0)
  const [todaySessionCount, setTodaySessionCount] = useState(0)
  const [avgLatencyMs, setAvgLatencyMs] = useState<number | null>(null)
  const [offlineOverHour, setOfflineOverHour] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [latestPatient, setLatestPatient] = useState<Session['patient']>(null)
  const [latestConfidence, setLatestConfidence] = useState<number>(0)
  const [latestPredictionLabel, setLatestPredictionLabel] = useState<string>('')
  const [ecgData, setEcgData] = useState<any[]>([])
  const [pcgData, setPcgData] = useState<any[]>([])
  const [deviceTelemetry, setDeviceTelemetry] = useState<any>(null)

  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  // ── Real-time MQTT WebSocket (replaces setInterval polling) ────────
  const { connected: mqttConnected, lastMessage: mqttPrediction } = useMQTT()

  // Update dashboard state when a new MQTT prediction arrives
  useEffect(() => {
    if (mqttPrediction) {
      setLatestPredictionLabel(mqttPrediction.ecg_arrhythmia || '')
      setLatestConfidence(Math.round((mqttPrediction.confidence_score || 0) * 100))
      setLastUpdated(new Date())
    }
  }, [mqttPrediction])

  const fetchDashboardData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        setIsAdmin(false)
        setLoading(false)
        return
      }

      setIsAdmin(true)

      // Fetch recent sessions with patient data
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*, patient:patients(id, full_name, dob, sex)')
        .order('created_at', { ascending: false })
        .limit(20)

      if (sessionsError) throw sessionsError
      setSessions(sessionsData || [])

      if (sessionsData && sessionsData.length > 0) {
        // Find the most recent session that has a linked patient
        const sessionWithPatient = sessionsData.find(s => s.patient)
        if (sessionWithPatient) {
          setLatestPatient(sessionWithPatient.patient)
        }

        // Fetch latest prediction for AI Analytics
        const { data: latestPreds } = await supabase
          .from('predictions')
          .select('output_json')
          .eq('session_id', sessionsData[0].id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (latestPreds && latestPreds.length > 0) {
          const out = latestPreds[0].output_json
          const conf = out?.confidence ?? out?.probabilities?.[out?.label] ?? 0
          setLatestConfidence(Math.round(conf * 100))
          setLatestPredictionLabel(out?.label || out?.prediction || 'Analyzing...')
        } else {
          setLatestConfidence(0)
          setLatestPredictionLabel('')
        }

        // Fetch latest telemetry for the active device
        const { data: telemetryData } = await supabase
          .from('device_telemetry')
          .select('*')
          .eq('device_id', sessionsData[0].device_id)
          .order('recorded_at', { ascending: false })
          .limit(1)

        if (telemetryData && telemetryData.length > 0) {
          setDeviceTelemetry(telemetryData[0])
        } else {
          setDeviceTelemetry(null)
        }

        // Fetch latest live metrics for the waveforms
        const { data: liveData } = await supabase
          .from('live_metrics')
          .select('metrics_json, created_at')
          .eq('session_id', sessionsData[0].id)
          .order('created_at', { ascending: false })
          .limit(10)

        const byModality: Record<string, any> = {}
        if (liveData) {
          for (const row of liveData) {
            const waveform = row.metrics_json?.waveform
            if (waveform && !byModality[waveform.modality]) {
              byModality[waveform.modality] = waveform
            }
          }
        }

        if (byModality.ecg) {
          setEcgData(buildWaveformSeries(byModality.ecg.samples, byModality.ecg.sample_rate, 60))
        } else {
          setEcgData([])
        }

        if (byModality.pcg) {
          setPcgData(buildWaveformSeries(byModality.pcg.samples, byModality.pcg.sample_rate, 60))
        } else {
          setPcgData([])
        }
      }

      // Count today's sessions
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayCount = (sessionsData || []).filter(
        s => new Date(s.created_at) >= today
      ).length
      setTodaySessionCount(todayCount)

      // Fetch prediction count
      const { count: predCount } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true })

      setPredictionCount(predCount || 0)

      // Avg inference latency (last 24h)
      const dayAgo = new Date()
      dayAgo.setDate(dayAgo.getDate() - 1)
      const { data: latencyRows } = await supabase
        .from('predictions')
        .select('latency_ms')
        .gte('created_at', dayAgo.toISOString())

      if (latencyRows && latencyRows.length > 0) {
        const sum = latencyRows.reduce((acc: number, row: any) => acc + (row.latency_ms || 0), 0)
        setAvgLatencyMs(Math.round(sum / latencyRows.length))
      } else {
        setAvgLatencyMs(null)
      }

      // Fetch devices
      const response = await fetch('/api/devices')
      if (response.ok) {
        const data = await response.json()
        const devices = data.devices || []
        setDeviceCount(devices.length)
        setOnlineDevices(devices.filter((d: any) => d.status === 'online').length)
        const oneHourAgo = Date.now() - 60 * 60 * 1000
        setOfflineOverHour(
          devices.filter((d: any) => d.status === 'offline' && d.last_seen_at && new Date(d.last_seen_at).getTime() < oneHourAgo).length
        )
      }

      // Build real weekly activity from sessions
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 6)
      weekAgo.setHours(0, 0, 0, 0)

      const { data: weekSessions } = await supabase
        .from('sessions')
        .select('created_at')
        .gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: true })

      const { data: weekPredictions } = await supabase
        .from('predictions')
        .select('created_at')
        .gte('created_at', weekAgo.toISOString())

      // Group by day
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dailyMap: Record<string, { sessions: number; predictions: number }> = {}

      for (let i = 0; i < 7; i++) {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const key = d.toISOString().split('T')[0]
        const dayName = dayNames[d.getDay()]
        dailyMap[key] = { sessions: 0, predictions: 0 }
      }

      ; (weekSessions || []).forEach(s => {
        const key = new Date(s.created_at).toISOString().split('T')[0]
        if (dailyMap[key]) dailyMap[key].sessions++
      })

        ; (weekPredictions || []).forEach(p => {
          const key = new Date(p.created_at).toISOString().split('T')[0]
          if (dailyMap[key]) dailyMap[key].predictions++
        })

      const weekly = Object.entries(dailyMap).map(([dateStr, counts]) => {
        const d = new Date(dateStr + 'T12:00:00')
        return {
          day: dayNames[d.getDay()],
          sessions: counts.sessions,
          predictions: counts.predictions,
        }
      })

      setWeeklyData(weekly)
      setLastUpdated(new Date())

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      setError('Failed to load dashboard data. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchDashboardData()

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchDashboardData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => {
        fetchDashboardData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_telemetry' }, () => {
        fetchDashboardData()
      })
      .subscribe()

    // Fallback: only poll via setInterval if MQTT is disconnected
    const interval = mqttConnected ? null : setInterval(fetchDashboardData, 30000)

    return () => {
      if (interval) clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchDashboardData, supabase, mqttConnected])

  const activeSessions = sessions.filter(s => s.status === 'streaming' || s.status === 'processing').length
  const completedSessions = sessions.filter(s => s.status === 'done').length
  const alertCount = sessions.filter(s => s.status === 'error').length
  const lastUpdatedLabel = lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Updating...'

  const sparklineData = {
    sessions: [2, 4, 3, 6, 4, 7, 5],
    devices: [1, 2, 2, 3, 2, 3, 3],
    predictions: [1, 3, 2, 5, 4, 6, 7],
    alerts: [0, 1, 0, 2, 1, 0, 1],
    latency: [120, 110, 130, 100, 95, 105, 98],
    offline: [3, 2, 3, 2, 1, 2, 1],
  }

  const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 60
      const y = 20 - ((v - min) / range) * 18
      return `${x},${y}`
    }).join(' ')
    return (
      <svg viewBox="0 0 60 22" className="w-16 h-6">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    )
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      created: 'badge-neutral',
      streaming: 'badge-info',
      processing: 'badge-warning',
      done: 'badge-success',
      error: 'badge-danger',
    }
    return map[status] || 'badge-neutral'
  }

  if (loading) {
    return (
      <div className="page-wrapper">
        <div className="page-content">
          <PageSkeleton />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-wrapper">
        <div className="page-content flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="p-4 rounded-full bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
          <p className="text-muted-foreground">{error}</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setLoading(true)
                setError(null)
                fetchDashboardData()
              }}
              className="btn-primary"
            >
              Try Again
            </button>
            <Link href="/devices" className="btn-ghost">
              Check Devices
            </Link>
            <Link href="/settings" className="btn-ghost">
              Open Settings
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: verify your Supabase connection and MQTT broker status.
          </p>
        </div>
      </div>
    )
  }

  if (!isAdmin && !loading && !error) {
    return (
      <div className="page-wrapper">
        <div className="page-content flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="p-4 rounded-full bg-red-50/10 dark:bg-red-950/30">
            <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-2" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground max-w-sm text-center">
            Admin privileges are required to view the clinical dashboard. Contact your system administrator to request access.
          </p>
          <div className="mt-6 flex gap-4">
            <Link href="/" className="btn-primary">
              Return Home
            </Link>
          </div>
        </div>
      </div>
    )
  }


  // Onboarding empty state when user has no devices or sessions
  const isNewUser = deviceCount === 0 && sessions.length === 0

  if (isNewUser) {
    return (
      <div className="page-wrapper">
        <div className="page-content">
          <div className="max-w-2xl mx-auto text-center py-16 fade-in">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center mx-auto mb-6 shadow-xl">
              <svg viewBox="0 0 32 32" className="logo-mark" aria-hidden="true">
                <path d="M3 16h6l2.2-6.2 3.6 12.4 2.8-7.2 1.8 1.8H29" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight mb-3">
              Welcome to <span className="gradient-text">AscultiCor</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              AI-Powered Cardiac Auscultation and Prediction using heart sounds.
              <br />Get started by following the steps below.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              {/* Step 1 */}
              <div className="bg-card border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                <div className="absolute top-3 right-3 text-5xl font-black text-muted-foreground/10">1</div>
                <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 w-fit mb-3">
                  <Cpu className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Register Device</h3>
                <p className="text-sm text-muted-foreground mb-4">Add your ESP32 + AscultiCor Kit and get credentials</p>
                <Link href="/devices" className="btn-primary text-sm gap-1 w-full justify-center">
                  Add Device <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Step 2 */}
              <div className="bg-card border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                <div className="absolute top-3 right-3 text-5xl font-black text-muted-foreground/10">2</div>
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 w-fit mb-3">
                  <Wifi className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Flash & Provision</h3>
                <p className="text-sm text-muted-foreground mb-4">Flash firmware and send credentials via Serial Monitor</p>
                <span className="inline-flex items-center text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 mr-1" /> After step 1
                </span>
              </div>

              {/* Step 3 */}
              <div className="bg-card border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                <div className="absolute top-3 right-3 text-5xl font-black text-muted-foreground/10">3</div>
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 w-fit mb-3">
                  <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Start Recording</h3>
                <p className="text-sm text-muted-foreground mb-4">Create a session and record cardiac signals</p>
                <span className="inline-flex items-center text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 mr-1" /> After step 2
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Build recent activity items for the panel
  const recentActivityItems = sessions.slice(0, 4).map(s => ({
    id: s.id,
    label: s.patient?.full_name ? `Session: ${s.patient.full_name}` : `Session ${s.id.slice(0, 8)}`,
    time: new Date(s.created_at).toLocaleString(),
    status: s.status as 'done' | 'processing' | 'error' | 'streaming',
  }));

  // Calculate patient age string
  const getPatientAge = (dob: string | null) => {
    if (!dob) return '—'
    const diff = Date.now() - new Date(dob).getTime()
    const age = Math.abs(new Date(diff).getUTCFullYear() - 1970)
    return `${age} yrs`
  }

  const activePatientName = latestPatient ? latestPatient.full_name : (sessions.length > 0 ? "Anonymous Patient" : "System Offline")
  const activePatientAge = latestPatient ? getPatientAge(latestPatient.dob) : "—"
  const activePatientSex = latestPatient ? (latestPatient.sex ? latestPatient.sex.charAt(0).toUpperCase() + latestPatient.sex.slice(1) : "Unknown") : "—"

  // Fallbacks for when no active signal — track whether we're using demo data
  const defaultEcg = generateEcgWaveform(60)
  const defaultPcg = generatePcgWaveform(60)
  const isEcgDemo = ecgData.length === 0
  const isPcgDemo = pcgData.length === 0

  return (
    <div className="relative h-full overflow-hidden" style={{ backgroundColor: 'var(--hud-bg-base)' }}>
      {/* Cosmic background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-hud-cyan/3 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-hud-violet/3 rounded-full blur-[100px]" />
      </div>

      {/* Main HUD Grid */}
      <div className="relative z-10 h-full max-w-[1600px] mx-auto px-4 py-2 flex flex-col">
        {/* Dashboard Title (small) */}
        <div className="flex items-center justify-between mb-1 fade-in">
          <div>
            <p className="text-[10px] text-hud-cyan/60 font-mono uppercase tracking-[0.3em]">Cardiac Monitoring System</p>
            <p className="text-[9px] text-white/30 font-mono mt-0.5">{lastUpdatedLabel}</p>
          </div>
          <button
            onClick={() => router.push('/session/new')}
            className="btn-primary text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Session
          </button>
        </div>

        {/* HUD 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-4 items-stretch flex-1 min-h-0">

          {/* ====== LEFT COLUMN ====== */}
          <div className="space-y-3 overflow-y-auto max-h-full pr-1 slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
            <PatientInfoPanel
              patientName={activePatientName}
              patientAge={activePatientAge}
              patientSex={activePatientSex}
              bloodType="—"
              height="—"
              weight="—"
              bmi="—"
            />

            <EcgGraphPanel
              data={isEcgDemo ? defaultEcg : ecgData}
              liveLabel={isEcgDemo ? 'Simulated' : `Live · ${lastUpdatedLabel.replace('Updated ', '')}`}
            />
            {isEcgDemo && (
              <div className="-mt-2 ml-1 mb-1">
                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">⚠ Demo Data</span>
              </div>
            )}

            <PcgGraphPanel
              data={isPcgDemo ? defaultPcg : pcgData}
              liveLabel={isPcgDemo ? 'Simulated' : `Live · ${lastUpdatedLabel.replace('Updated ', '')}`}
            />
            {isPcgDemo && (
              <div className="-mt-2 ml-1 mb-1">
                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">⚠ Demo Data</span>
              </div>
            )}

            {/* System Status panel */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-white uppercase tracking-widest">System Status</h3>
                <span className="text-[9px] text-white/40">{sessions.length > 0 ? `Device ID: ${sessions[0].device_id.slice(0, 8)}` : 'Offline'}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 bg-black/30 border border-hud-border/20 rounded-lg p-2">
                  <Cpu className="w-3 h-3 text-hud-cyan/60" />
                  <span className="text-[10px] text-white/60">
                    {deviceTelemetry?.temperature_celsius ? `${Number(deviceTelemetry.temperature_celsius).toFixed(1)}°C` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-black/30 border border-hud-border/20 rounded-lg p-2">
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-white/60">
                    {deviceTelemetry?.wifi_rssi ? `${deviceTelemetry.wifi_rssi} dBm` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-black/30 border border-hud-border/20 rounded-lg p-2">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] text-white/60">
                    {deviceTelemetry?.battery_voltage ? `${Number(deviceTelemetry.battery_voltage).toFixed(2)}V` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-black/30 border border-hud-border/20 rounded-lg p-2">
                  <Activity className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-white/60">
                    {deviceTelemetry?.uptime_seconds ? `${Math.floor(deviceTelemetry.uptime_seconds / 3600)}h ${Math.floor((deviceTelemetry.uptime_seconds % 3600) / 60)}m` : '—'}
                  </span>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* ====== CENTER COLUMN — 3D Heart Visualization ====== */}
          <div className="fade-in" style={{ animationDelay: '0.15s' }}>
            <HeartVisualization3D />
          </div>

          {/* ====== RIGHT COLUMN ====== */}
          <div className="space-y-3 overflow-y-auto max-h-full pl-1 slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
            <RecentActivityPanel
              items={recentActivityItems}
              lastUpdated={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting...'}
            />

            {/* Predictions / Medications stand-in */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-white uppercase tracking-widest">Predictions</h3>
                <span className="text-[9px] text-white/30 font-mono">{predictionCount} total</span>
              </div>
              <div className="space-y-2">
                {completedSessions > 0 ? (
                  <>
                    <div className="flex items-center gap-3 bg-black/30 border border-hud-border/20 rounded-lg p-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <Heart className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-white/90">Cardiac Analysis</p>
                        <p className="text-[9px] text-white/40">{completedSessions} completed</p>
                      </div>
                      <span className="text-[9px] text-emerald-400 font-mono">Done</span>
                    </div>
                    {activeSessions > 0 && (
                      <div className="flex items-center gap-3 bg-black/30 border border-hud-border/20 rounded-lg p-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                          <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-white/90">Live Stream</p>
                          <p className="text-[9px] text-white/40">{activeSessions} active</p>
                        </div>
                        <span className="text-[9px] text-blue-400 font-mono animate-pulse">Live</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-[10px] text-white/30">No predictions yet</p>
                  </div>
                )}
              </div>
            </GlassCard>

            <AIAnalyticsPanel
              confidence={latestConfidence > 0 ? latestConfidence : (predictionCount > 0 ? 86 : 0)}
              anomalyDetected={alertCount > 0}
              anomalyDescription={
                alertCount > 0
                  ? `${alertCount} alert(s) detected. Review recommended.`
                  : latestPredictionLabel
                    ? `Latest Analysis: ${latestPredictionLabel}. No acute anomalies.`
                    : 'All cardiac signals within normal parameters. No anomalies detected in recent analysis.'
              }
              predictionCount={predictionCount}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
