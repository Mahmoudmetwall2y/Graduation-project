'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, Battery, Wifi, Clock, AlertCircle, ChevronLeft,
  FileText, Settings, Trash2, RefreshCw, Plus, Heart,
  Cpu, Zap, CheckCircle, Eye
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { PageSkeleton } from '../../components/Skeleton'

interface Session {
  id: string
  status: string
  created_at: string
  ended_at: string | null
  predictions: any[]
}

interface Telemetry {
  id: string
  temperature_celsius: number
  battery_voltage: number
  wifi_rssi: number
  recorded_at: string
}

interface Alert {
  id: string
  alert_type: string
  severity: string
  message: string
  created_at: string
  is_resolved: boolean
}

interface Device {
  id: string
  device_name: string
  device_type: string
  status: string
  last_seen_at: string
  battery_level: number
  signal_strength: number
  firmware_version: string
  hardware_version: string
  notes: string
  device_groups: { name: string }
  sessions: Session[]
}

export default function DeviceDetailPage() {
  const params = useParams()
  const deviceId = params.id as string

  const [device, setDevice] = useState<Device | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [generatingReport, setGeneratingReport] = useState<string | null>(null)

  const supabase = createClientComponentClient()

  useEffect(() => {
    if (deviceId) {
      fetchDeviceData()

      // Subscribe to real-time device changes
      const channel = supabase
        .channel(`device-${deviceId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'devices',
          filter: `id=eq.${deviceId}`
        }, () => {
          fetchDeviceData()
        })
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'device_telemetry',
          filter: `device_id=eq.${deviceId}`
        }, () => {
          fetchDeviceData()
        })
        .subscribe()

      // Fallback poll every 30s
      const interval = setInterval(fetchDeviceData, 30000)

      return () => {
        clearInterval(interval)
        supabase.removeChannel(channel)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  const fetchDeviceData = async () => {
    try {
      const response = await fetch(`/api/devices/${deviceId}`)
      if (!response.ok) throw new Error('Failed to fetch device')
      const data = await response.json()
      setDevice(data.device)
      setTelemetry(data.telemetry)
      setAlerts(data.alerts)
      setStats(data.stats)
    } catch (error) {
      console.error('Error fetching device data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateLLMReport = async (sessionId: string) => {
    setGeneratingReport(sessionId)
    try {
      const response = await fetch('/api/llm/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, device_id: deviceId })
      })
      if (!response.ok) throw new Error('Failed to generate report')
      alert('LLM Report generated successfully!')
      fetchDeviceData()
    } catch (error) {
      console.error('Error generating report:', error)
      alert('Failed to generate report')
    } finally {
      setGeneratingReport(null)
    }
  }

  const formatLastSeen = (date: string) => {
    if (!date) return 'Never'
    const lastSeen = new Date(date)
    const now = new Date()
    const diff = Math.floor((now.getTime() - lastSeen.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    return `${Math.floor(diff / 86400)} days ago`
  }

  if (loading) return <div className="page-wrapper"><PageSkeleton /></div>

  if (!device) {
    return (
      <div className="page-wrapper">
        <div className="page-content flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Device Not Found</h2>
            <Link href="/devices" className="text-primary hover:text-primary/80 text-sm font-medium">← Back to Devices</Link>
          </div>
        </div>
      </div>
    )
  }

  const tabs = ['overview', 'sessions', 'telemetry', 'alerts', 'settings']

  // Convert telemetry for charts
  const telemetryChartData = telemetry.map(t => ({
    time: new Date(t.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    temperature: t.temperature_celsius,
    battery: t.battery_voltage,
    wifi: Math.abs(t.wifi_rssi),
  }))

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">

        {/* Back link */}
        <Link href="/devices" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back to Devices
        </Link>

        {/* Device Header Card */}
        <div className="bg-card border border-border rounded-xl p-6 fade-in">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Cpu className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">{device.device_name}</h1>
                  <span className={`badge ${device.status === 'online' ? 'badge-success' : device.status === 'error' ? 'badge-danger' : 'badge-neutral'}`}>
                    {device.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {device.device_type.toUpperCase()} • ID: {device.id.slice(0, 12)}...
                </p>
                {device.device_groups?.name && (
                  <span className="badge badge-info mt-2">{device.device_groups.name}</span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={fetchDeviceData} className="btn-ghost p-2">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button className="btn-ghost p-2">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
            {[
              { icon: Clock, label: 'Last Seen', value: formatLastSeen(device.last_seen_at) },
              { icon: Battery, label: 'Battery', value: device.battery_level ? `${device.battery_level}%` : 'N/A' },
              { icon: Wifi, label: 'Signal', value: device.signal_strength ? `${device.signal_strength} dBm` : 'N/A' },
              { icon: Activity, label: 'Sessions', value: stats?.totalSessions || 0 },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <stat.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">{stat.label}</p>
                  <p className="text-sm font-semibold text-foreground">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-card border border-border rounded-xl overflow-hidden fade-in">
          <div className="border-b border-border">
            <nav className="flex overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3.5 text-sm font-medium capitalize whitespace-nowrap border-b-2 transition-colors ${activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6 slide-up">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-foreground">Recent Sessions</h3>
                    <Link href={`/session/new?device=${deviceId}`} className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> New Session
                    </Link>
                  </div>

                  {!device.sessions?.length ? (
                    <p className="text-sm text-muted-foreground py-4">No sessions yet</p>
                  ) : (
                    <div className="space-y-2">
                      {device.sessions.slice(0, 5).map((session) => (
                        <div key={session.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-3">
                            <Heart className="w-4 h-4 text-primary" />
                            <div>
                              <p className="text-sm font-medium text-foreground">Session {session.id.slice(0, 8)}</p>
                              <p className="text-xs text-muted-foreground">{new Date(session.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`badge ${session.status === 'done' ? 'badge-success' :
                              session.status === 'streaming' ? 'badge-info' : 'badge-warning'}`}>
                              {session.status}
                            </span>
                            <Link href={`/session/${session.id}`} className="btn-ghost p-1.5">
                              <Eye className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {alerts.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-4">Active Alerts</h3>
                    <div className="space-y-2">
                      {alerts.map((alert) => (
                        <div key={alert.id} className={`p-4 rounded-lg border ${alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50' :
                          alert.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' :
                            'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50'
                          }`}>
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-4 h-4 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium capitalize">{alert.alert_type}</p>
                              <p className="text-xs mt-1 opacity-80">{alert.message}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sessions Tab */}
            {activeTab === 'sessions' && (
              <div className="slide-up">
                <h3 className="font-semibold text-foreground mb-4">All Sessions</h3>
                {!device.sessions?.length ? (
                  <p className="text-sm text-muted-foreground py-4">No sessions recorded</p>
                ) : (
                  <div className="space-y-2">
                    {device.sessions.map((session) => (
                      <div key={session.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-medium text-sm text-foreground">Session {session.id.slice(0, 8)}</p>
                            <span className={`badge ${session.status === 'done' ? 'badge-success' :
                              session.status === 'streaming' ? 'badge-info' : 'badge-warning'}`}>
                              {session.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(session.created_at).toLocaleString()}
                            {session.ended_at && ` → ${new Date(session.ended_at).toLocaleTimeString()}`}
                          </p>
                          {session.predictions?.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">{session.predictions.length} predictions</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => generateLLMReport(session.id)}
                            disabled={generatingReport === session.id}
                            className="btn-ghost text-xs gap-1 badge-purple px-2.5 py-1.5"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {generatingReport === session.id ? 'Generating...' : 'LLM Report'}
                          </button>
                          <Link href={`/session/${session.id}`} className="btn-ghost text-xs gap-1 px-2.5 py-1.5">
                            <Eye className="w-3.5 h-3.5" /> View
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Telemetry Tab */}
            {activeTab === 'telemetry' && (
              <div className="slide-up space-y-6">
                <h3 className="font-semibold text-foreground">Device Telemetry (Last 24 Hours)</h3>
                {telemetry.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No telemetry data available</p>
                ) : (
                  <>
                    {/* Temperature Chart */}
                    <div className="bg-muted/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <h4 className="text-sm font-semibold text-foreground">Temperature</h4>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={telemetryChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: 'hsl(var(--foreground))',
                            }}
                          />
                          <Line type="monotone" dataKey="temperature" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Battery + WiFi Chart */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-muted/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Battery className="w-4 h-4 text-emerald-500" />
                          <h4 className="text-sm font-semibold text-foreground">Battery Voltage</h4>
                        </div>
                        <ResponsiveContainer width="100%" height={150}>
                          <LineChart data={telemetryChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px', color: 'hsl(var(--foreground))' }} />
                            <Line type="monotone" dataKey="battery" stroke="#10b981" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="bg-muted/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Wifi className="w-4 h-4 text-blue-500" />
                          <h4 className="text-sm font-semibold text-foreground">WiFi RSSI</h4>
                        </div>
                        <ResponsiveContainer width="100%" height={150}>
                          <LineChart data={telemetryChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px', color: 'hsl(var(--foreground))' }} />
                            <Line type="monotone" dataKey="wifi" stroke="#3b82f6" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Alerts Tab */}
            {activeTab === 'alerts' && (
              <div className="slide-up">
                <h3 className="font-semibold text-foreground mb-4">Device Alerts</h3>
                {alerts.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-10 h-10 text-emerald-500/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No active alerts — all clear!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div key={alert.id} className={`p-4 rounded-lg border ${alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50' :
                        alert.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' :
                          'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50'
                        }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-4 h-4 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium capitalize">{alert.alert_type}</p>
                              <p className="text-xs mt-1 opacity-80">{alert.message}</p>
                              <p className="text-xs mt-2 opacity-50">{new Date(alert.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                          {!alert.is_resolved && (
                            <button className="text-xs font-medium text-primary hover:text-primary/80">Resolve</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="slide-up space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-4">Device Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'Device ID', value: device.id, mono: true },
                      { label: 'Device Type', value: device.device_type },
                      { label: 'Firmware', value: device.firmware_version || 'Unknown' },
                      { label: 'Hardware', value: device.hardware_version || 'Unknown' },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{item.label}</p>
                        <p className={`text-sm text-foreground ${item.mono ? 'font-mono bg-muted p-2 rounded-lg' : ''}`}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {device.notes && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Notes</h3>
                    <p className="text-sm text-muted-foreground bg-muted p-4 rounded-lg">{device.notes}</p>
                  </div>
                )}

                <div className="pt-6 border-t border-border">
                  <h3 className="font-semibold text-red-600 dark:text-red-400 mb-4">Danger Zone</h3>
                  <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Delete Device
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
