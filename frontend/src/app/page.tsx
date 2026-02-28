'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, Cpu, AlertTriangle, Clock, TrendingUp, Heart, Zap, Plus, Wifi, WifiOff, BarChart3, Search, Phone, Bell, ArrowUpRight
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
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

const Header = () => (
  <div className="flex items-center justify-between w-full pt-4 pb-2">
    <div className="flex items-center gap-6">
      <div className="flex bg-white rounded-full p-1.5 shadow-sm border border-border">
        <button className="px-5 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:bg-slate-50 transition-colors">Diagnose</button>
        <button className="px-5 py-1.5 rounded-full text-sm font-bold text-foreground flex items-center gap-2 shadow-sm bg-white ring-1 ring-border">
          <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
          Overview Dashboard
        </button>
      </div>
    </div>

    <div className="flex items-center gap-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search..."
          className="pl-11 pr-4 py-2 bg-white rounded-full text-sm border border-border w-64 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm transition-all"
        />
      </div>
      <button className="w-10 h-10 flex-shrink-0 rounded-full bg-primary text-white flex items-center justify-center shadow-md shadow-primary/30 hover:bg-blue-600 transition-colors">
        <Phone className="w-4 h-4 fill-current" />
      </button>
      <button className="relative flex-shrink-0 w-10 h-10 rounded-full bg-white text-foreground flex items-center justify-center border border-border hover:bg-slate-50 transition-colors shadow-sm">
        <Bell className="w-4 h-4" />
        <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
      </button>
      <Link href="/settings" className="w-10 h-10 flex-shrink-0 hover:ring-2 hover:ring-primary/50 transition-all rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden flex items-center justify-center text-slate-500 font-bold text-sm">
        AJ
      </Link>
    </div>
  </div>
)

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
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (sessionsError) throw sessionsError
      setSessions(sessionsData || [])

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayCount = (sessionsData || []).filter(
        s => new Date(s.created_at) >= today
      ).length
      setTodaySessionCount(todayCount)

      const { count: predCount } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true })
      setPredictionCount(predCount || 0)

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

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dailyMap: Record<string, { sessions: number; predictions: number }> = {}

      for (let i = 0; i < 7; i++) {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const key = d.toISOString().split('T')[0]
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => fetchDashboardData())
      .subscribe()

    const interval = setInterval(fetchDashboardData, 30000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchDashboardData, supabase])

  const activeSessions = sessions.filter(s => s.status === 'streaming' || s.status === 'processing').length
  const alertCount = sessions.filter(s => s.status === 'error').length
  const isNewUser = !loading && deviceCount === 0 && sessions.length === 0

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col px-8">
        <Header />
        <div className="flex-1 mt-8"><PageSkeleton /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col px-8">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center mb-20 space-y-4">
          <div className="p-4 rounded-full bg-red-50">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
          <p className="text-muted-foreground">{error}</p>
          <div className="flex gap-3">
            <button onClick={() => { setLoading(true); setError(null); fetchDashboardData() }} className="px-6 py-2 bg-primary text-white rounded-xl font-medium">Try Again</button>
          </div>
        </div>
      </div>
    )
  }

  if (isNewUser) {
    return (
      <div className="w-full h-full flex flex-col px-8">
        <Header />
        <div className="flex-1 bg-white rounded-[3rem] p-12 shadow-sm border border-border flex flex-col items-center justify-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-6 shadow-xl">
            <svg viewBox="0 0 32 32" className="w-10 h-10" aria-hidden="true">
              <path d="M3 16h6l2.2-6.2 3.6 12.4 2.8-7.2 1.8 1.8H29" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-3">Welcome to AscultiCor</h1>
          <p className="text-lg text-muted-foreground mb-10 text-center">AI-Powered Cardiac Auscultation and Prediction.<br />Get started with 3 easy steps.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 relative">
              <div className="p-3 rounded-xl bg-teal-100 w-fit mb-4"><Cpu className="w-6 h-6 text-teal-600" /></div>
              <h3 className="font-semibold text-lg text-foreground mb-1">1. Register Device</h3>
              <p className="text-sm text-muted-foreground mb-6">Add your ESP32 + AscultiCor Kit and get credentials</p>
              <Link href="/devices" className="w-full py-2 bg-primary text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2">Add Device <ArrowUpRight className="w-3.5 h-3.5" /></Link>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 relative">
              <div className="p-3 rounded-xl bg-blue-100 w-fit mb-4"><Wifi className="w-6 h-6 text-blue-600" /></div>
              <h3 className="font-semibold text-lg text-foreground mb-1">2. Flash & Provision</h3>
              <p className="text-sm text-muted-foreground mb-6">Flash firmware and send credentials via Serial Monitor</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 relative">
              <div className="p-3 rounded-xl bg-rose-100 w-fit mb-4"><Heart className="w-6 h-6 text-rose-600" /></div>
              <h3 className="font-semibold text-lg text-foreground mb-1">3. Start Recording</h3>
              <p className="text-sm text-muted-foreground mb-6">Create a session and record cardiac signals instantly.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full xl:h-screen flex flex-col px-6 overflow-y-auto overflow-x-hidden">
      <Header />

      <div className="flex flex-col xl:flex-row gap-6 pb-2 flex-1 min-h-0">

        {/* Left Column: Hero Title & Main Visual (Heart) */}
        <div className="xl:w-1/3 flex flex-col min-h-0 shrink-0 flex-grow-0">
          <h1 className="text-5xl font-black leading-[1.1] text-foreground tracking-tight mb-4 relative z-30">
            Overview<br />Conditions
          </h1>
          <div className="flex-1 relative bg-white/40 rounded-[2.5rem] flex flex-col items-center justify-center min-h-[350px]">
            {/* The Heart text bubble */}
            <div className="absolute top-6 left-6 bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-elevated border border-white z-20 transition-transform hover:scale-105">
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Live Connect</span>
              </div>
              <p className="text-xl font-bold">{onlineDevices} / {deviceCount} <span className="text-xs font-medium text-muted-foreground">Devices</span></p>
              <div className="mt-2 text-[10px] text-muted-foreground">{lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : ''}</div>
            </div>

            {/* The Animated Heart Visual */}
            <div className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none">
              <img
                src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzNwaDdvdHd4NTR2anI3MnU3amtkazhta3F6ZWxwYWNiMTljYzVweiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/l6JC0IxMDIS4QrUxO5/giphy.gif"
                alt="Animated Anatomical Heart"
                className="w-[85%] h-[85%] object-contain opacity-95 transition-transform hover:scale-105 duration-700 ease-out"
              />
            </div>
          </div>
        </div>

        {/* Middle & Right columns grid */}
        <div className="xl:w-2/3 flex flex-col gap-4 shrink-0 flex-grow-0 pt-1 h-full min-h-0">

          {/* Top: Stats Grid */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <h2 className="text-sm font-semibold text-foreground tracking-wide">Infrastructure Health</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-1 shrink-0">

            {/* Active Sessions */}
            <div className="bg-primary rounded-[1.5rem] p-4 shadow-elevated border border-primary flex flex-col justify-between transform transition-transform hover:-translate-y-1">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex flex-shrink-0 items-center justify-center text-white">
                  <Activity className="w-4 h-4 fill-current" />
                </div>
                <div className="flex flex-col flex-1 truncate">
                  <p className="text-[10px] text-primary-foreground/80 font-medium mb-0.5 uppercase tracking-wider">Active Sessions</p>
                  <p className="font-bold text-lg text-white leading-tight">{activeSessions}</p>
                </div>
              </div>
              <div className="h-8 w-full mt-2">
                <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full stroke-white fill-none stroke-2 opacity-80 mt-1">
                  <polyline points="0,15 10,15 15,5 20,25 25,15 35,15 40,-5 45,35 50,15 60,15 65,10 70,20 75,15 100,15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Predictions */}
            <div className="bg-white rounded-[1.5rem] p-4 shadow-sm border border-border flex flex-col justify-between group hover:shadow-card transition-all">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div className="flex flex-col flex-1 truncate">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">Total Predictions</p>
                  <p className="font-bold text-lg text-foreground leading-tight">{predictionCount}</p>
                </div>
              </div>
              <div className="h-8 w-full mt-2 opacity-30 flex items-end gap-1">
                {[40, 60, 45, 80, 50, 70, 45].map((h, i) => (
                  <div key={i} className="flex-1 bg-slate-300 rounded-sm" style={{ height: `${h}%` }}></div>
                ))}
              </div>
            </div>

            {/* Avg Latency */}
            <div className="bg-white rounded-[1.5rem] p-4 shadow-sm border border-border flex flex-col justify-between group hover:shadow-card transition-all">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex flex-col flex-1 truncate">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">Avg Latency</p>
                  <p className="font-bold text-lg text-foreground leading-tight">{avgLatencyMs ? `${avgLatencyMs}ms` : '-'}</p>
                </div>
              </div>
              <div className="h-8 w-full mt-2 relative">
                <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full stroke-slate-200 fill-transparent stroke-[3px] mt-1">
                  <path d="M0,20 Q25,5 50,20 T100,20 L100,20 L0,20 Z" />
                </svg>
              </div>
            </div>

            {/* Alerts */}
            <div className={`bg-white rounded-[1.5rem] p-4 shadow-sm border ${alertCount > 0 ? 'border-red-200' : 'border-border'} flex flex-col justify-between group hover:shadow-card transition-all`}>
              <div className="flex gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${alertCount > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {alertCount > 0 ? <AlertTriangle className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                </div>
                <div className="flex flex-col flex-1 truncate">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">System Alerts</p>
                  <p className={`font-bold text-lg leading-tight ${alertCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{alertCount > 0 ? alertCount : 'All Clear'}</p>
                </div>
              </div>
              <div className="h-8 w-full mt-2 flex items-end">
                <div className={`w-full h-1 rounded-full ${alertCount > 0 ? 'bg-red-200' : 'bg-emerald-100'}`}></div>
              </div>
            </div>

            {/* Offline Devices */}
            <div className={`bg-white rounded-[1.5rem] p-4 shadow-sm border ${offlineOverHour > 0 ? 'border-amber-200' : 'border-border'} flex flex-col justify-between group hover:shadow-card transition-all`}>
              <div className="flex gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${offlineOverHour > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>
                  <WifiOff className="w-4 h-4" />
                </div>
                <div className="flex flex-col flex-1 truncate">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">Offline &gt; 1h</p>
                  <p className={`font-bold text-lg leading-tight ${offlineOverHour > 0 ? 'text-amber-600' : 'text-foreground'}`}>{offlineOverHour}</p>
                </div>
              </div>
              <div className="h-8 w-full mt-2 flex items-end">
                <div className={`w-full h-1 rounded-full ${offlineOverHour > 0 ? 'bg-amber-200' : 'bg-slate-100'}`}></div>
              </div>
            </div>

            {/* Total Devices */}
            <div className={`bg-white rounded-[1.5rem] p-4 shadow-sm border border-border flex flex-col justify-between group hover:shadow-card transition-all`}>
              <div className="flex gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white`}>
                  <Cpu className="w-4 h-4" />
                </div>
                <div className="flex flex-col flex-1 truncate">
                  <p className="text-[10px] text-muted-foreground font-medium mb-0.5 uppercase tracking-wider">Total Devices</p>
                  <p className={`font-bold text-lg leading-tight text-foreground`}>{deviceCount}</p>
                </div>
              </div>
              <div className="h-8 w-full mt-2 flex items-end">
                <div className={`w-full h-1 rounded-full bg-indigo-100`}></div>
              </div>
            </div>
          </div>

          {/* Bottom section: Recharts & Sessions */}
          <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 pb-2">

            {/* Weekly Activity Bar Chart */}
            <div className="flex-[2] bg-white rounded-[1.5rem] p-4 flex flex-col shadow-sm border border-border hover:shadow-card transition-shadow min-h-0">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <h2 className="font-bold text-base text-foreground tracking-tight">Weekly Activity</h2>
                </div>
                <div className="flex gap-3 text-[11px] font-semibold">
                  <div className="flex items-center gap-1 text-slate-500"><div className="w-2 h-2 rounded bg-teal-600"></div>Sessions</div>
                  <div className="flex items-center gap-1 text-slate-500"><div className="w-2 h-2 rounded bg-blue-500"></div>Predictions</div>
                </div>
              </div>
              {weeklyData.every(d => d.sessions === 0 && d.predictions === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center pb-8">
                  <BarChart3 className="w-10 h-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">No activity this week</p>
                </div>
              ) : (
                <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="sessions" fill="#0d9488" radius={[6, 6, 0, 0]} name="Sessions" />
                      <Bar dataKey="predictions" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Predictions" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Recent Sessions List */}
            <div className="w-full lg:w-1/3 bg-white rounded-[1.5rem] p-4 flex flex-col shadow-sm border border-border hover:shadow-card transition-shadow min-h-0">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-bold text-base text-foreground tracking-tight">Recent</h2>
                </div>
                <Link href="/sessions" className="text-primary text-[11px] font-semibold hover:underline">View All</Link>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                {sessions.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-muted-foreground">No sessions yet.</p>
                  </div>
                ) : (
                  sessions.slice(0, 5).map(session => (
                    <Link href={`/session/${session.id}`} key={session.id} className="bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl p-3 flex flex-col gap-2 transition-colors cursor-pointer block">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 flex-shrink-0 rounded-full bg-white flex items-center justify-center font-bold text-xs shadow-sm border border-slate-100 ${session.status === 'done' ? 'text-emerald-500' : session.status === 'error' ? 'text-red-500' : 'text-blue-500'}`}>
                            {session.status.charAt(0).toUpperCase()}
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-bold text-xs text-slate-800 truncate">S: {session.id.slice(0, 6)}</p>
                            <p className="text-[10px] text-slate-500 truncate">{new Date(session.created_at).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white border shadow-sm flex-shrink-0 ${session.status === 'done' ? 'text-emerald-700 border-emerald-100' : session.status === 'error' ? 'text-red-700 border-red-100' : 'text-blue-700 border-blue-100'}`}>
                          {session.status}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
