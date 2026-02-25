'use client'

import { useState, useEffect, useCallback } from 'react'
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
  Stethoscope
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
import { PageSkeleton } from './components/Skeleton'

interface Session {
  id: string
  status: string
  created_at: string
  device_id: string
  ended_at: string | null
}

interface DailyActivity {
  day: string
  sessions: number
  predictions: number
}

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

  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch recent sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (sessionsError) throw sessionsError
      setSessions(sessionsData || [])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        fetchDashboardData()
      })
      .subscribe()

    const interval = setInterval(fetchDashboardData, 30000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchDashboardData, supabase])

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

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Monitor your cardiac analysis sessions in real-time</p>
            <p className="text-xs text-muted-foreground mt-1">{lastUpdatedLabel}</p>
          </div>
          <button
            onClick={() => router.push('/session/new')}
            className="btn-primary gap-2"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            {
              label: 'Active Sessions',
              value: activeSessions,
              icon: Activity,
              bgLight: 'bg-teal-50 dark:bg-teal-950/30',
              textColor: 'text-teal-700 dark:text-teal-400',
              change: todaySessionCount > 0 ? `+${todaySessionCount} today` : 'No sessions today',
              spark: sparklineData.sessions,
              sparkColor: 'hsl(172, 66%, 35%)',
            },
            {
              label: 'Devices',
              value: `${onlineDevices}/${deviceCount}`,
              icon: Cpu,
              bgLight: 'bg-blue-50 dark:bg-blue-950/30',
              textColor: 'text-blue-700 dark:text-blue-400',
              change: onlineDevices > 0 ? `${onlineDevices} online` : 'All offline',
              spark: sparklineData.devices,
              sparkColor: 'hsl(213, 94%, 48%)',
            },
            {
              label: 'Predictions',
              value: predictionCount,
              icon: BarChart3,
              bgLight: 'bg-purple-50 dark:bg-purple-950/30',
              textColor: 'text-purple-700 dark:text-purple-400',
              change: `${completedSessions} sessions completed`,
              spark: sparklineData.predictions,
              sparkColor: 'hsl(262, 83%, 58%)',
            },
            {
              label: 'Alerts',
              value: alertCount,
              icon: AlertTriangle,
              bgLight: alertCount > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30',
              textColor: alertCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
              change: alertCount > 0 ? 'Needs attention' : 'All clear OK',
              spark: sparklineData.alerts,
              sparkColor: alertCount > 0 ? 'hsl(38, 92%, 50%)' : 'hsl(142, 71%, 35%)',
            },
            {
              label: 'Avg Latency (24h)',
              value: avgLatencyMs ? `${avgLatencyMs}ms` : '-',
              icon: Zap,
              bgLight: 'bg-sky-50 dark:bg-sky-950/30',
              textColor: 'text-sky-700 dark:text-sky-400',
              change: avgLatencyMs ? 'Inference speed' : 'No recent data',
              spark: sparklineData.latency,
              sparkColor: 'hsl(199, 89%, 48%)',
            },
            {
              label: 'Offline > 1h',
              value: offlineOverHour,
              icon: WifiOff,
              bgLight: offlineOverHour > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30',
              textColor: offlineOverHour > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
              change: offlineOverHour > 0 ? 'Needs attention' : 'All clear',
              spark: sparklineData.offline,
              sparkColor: offlineOverHour > 0 ? 'hsl(38, 92%, 50%)' : 'hsl(142, 71%, 35%)',
            },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={`stat-card bg-card border border-border slide-up stagger-${(i % 4) + 1}`}
              style={{ animationFillMode: 'backwards' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                  <p className={`text-xs font-medium mt-2 ${stat.textColor}`}>{stat.change}</p>
                  <div className="mt-3">
                    <Sparkline values={stat.spark} color={stat.sparkColor} />
                  </div>
                </div>
                <div className={`p-2.5 rounded-xl ${stat.bgLight}`}>
                  <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Session Summary */}
          <div className="page-section slide-up" style={{ animationFillMode: 'backwards', animationDelay: '0.2s' }}>
            <div className="section-header">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="section-title">Session Overview</h3>
              </div>
              <span className="section-subtitle">{sessions.length} total</span>
            </div>
            {/* Session status breakdown */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Completed', count: completedSessions, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                { label: 'Active', count: activeSessions, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
                { label: 'Created', count: sessions.filter(s => s.status === 'created').length, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-950/30' },
                { label: 'Errors', count: alertCount, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' },
              ].map(item => (
                <div key={item.label} className={`rounded-lg p-3 ${item.bg}`}>
                  <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Device status */}
            <div className="flex items-center gap-4 pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${onlineDevices > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                <span className="text-sm text-muted-foreground">{onlineDevices} device{onlineDevices !== 1 ? 's' : ''} online</span>
              </div>
              <div className="flex items-center gap-2">
                <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{deviceCount - onlineDevices} offline</span>
              </div>
            </div>
          </div>

          {/* Weekly Activity */}
          <div className="page-section slide-up" style={{ animationFillMode: 'backwards', animationDelay: '0.25s' }}>
            <div className="section-header">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="section-title">Weekly Activity</h3>
              </div>
              <span className="section-subtitle">Last 7 days</span>
            </div>
            {weeklyData.every(d => d.sessions === 0 && d.predictions === 0) ? (
              <div className="flex flex-col items-center justify-center h-[200px] text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No activity this week</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Start a session to see data here</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
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
                  <Bar dataKey="sessions" fill="hsl(172, 66%, 35%)" radius={[6, 6, 0, 0]} name="Sessions" />
                  <Bar dataKey="predictions" fill="hsl(213, 94%, 48%)" radius={[6, 6, 0, 0]} name="Predictions" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Sessions */}
          <div className="page-section slide-up" style={{ animationFillMode: 'backwards', animationDelay: '0.3s' }}>
            <div className="section-header">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <h3 className="section-title">Recent Sessions</h3>
              </div>
            <Link href="/sessions" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
              <span className="inline-flex items-center gap-1">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>

          {sessions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/15 to-blue-500/10 mx-auto mb-4 flex items-center justify-center">
                <Heart className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No sessions yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start a session to capture heart sounds and build your patient baseline.
              </p>
              <button onClick={() => router.push('/session/new')} className="btn-primary gap-2">
                <Plus className="w-4 h-4" />
                Start First Session
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-3 px-6 table-header">
                <span>Session</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-border mt-2">
              {sessions.slice(0, 8).map((session) => (
                <Link
                  key={session.id}
                  href={`/session/${session.id}`}
                  className="list-row group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Heart className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Session {session.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(session.created_at).toLocaleString()}
                        {session.ended_at && `  -  Duration: ${Math.round((new Date(session.ended_at).getTime() - new Date(session.created_at).getTime()) / 1000)}s`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${getStatusBadge(session.status)}`}>
                      {session.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
