'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  Activity, 
  Battery, 
  Wifi, 
  Clock, 
  AlertCircle,
  ChevronLeft,
  Play,
  FileText,
  Settings,
  Trash2,
  Edit3,
  RefreshCw,
  Plus
} from 'lucide-react'

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

  // Polling for real-time updates (free alternative to Supabase Realtime)
  useEffect(() => {
    if (deviceId) {
      fetchDeviceData()
      
      // Poll every 3 seconds for updates
      const interval = setInterval(fetchDeviceData, 3000)
      
      return () => clearInterval(interval)
    }
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

  // Supabase Realtime subscription (disabled - using polling instead)
  // This avoids needing Supabase paid plan for Realtime
  /*
  const subscribeToUpdates = () => {
    const channel = supabase
      .channel(`device-${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
          filter: `id=eq.${deviceId}`,
        },
        (payload) => {
          setDevice((prev) => prev ? { ...prev, ...payload.new } : null)
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }
  */

  const generateLLMReport = async (sessionId: string) => {
    setGeneratingReport(sessionId)
    try {
      const response = await fetch('/api/llm/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          device_id: deviceId
        })
      })

      if (!response.ok) throw new Error('Failed to generate report')
      
      const data = await response.json()
      alert('LLM Report generated successfully!')
      fetchDeviceData()
    } catch (error) {
      console.error('Error generating report:', error)
      alert('Failed to generate report')
    } finally {
      setGeneratingReport(null)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      online: 'bg-green-100 text-green-800 border-green-200',
      offline: 'bg-gray-100 text-gray-800 border-gray-200',
      error: 'bg-red-100 text-red-800 border-red-200',
      maintenance: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getAlertColor = (severity: string) => {
    const colors: Record<string, string> = {
      info: 'bg-blue-50 text-blue-800 border-blue-200',
      warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
      critical: 'bg-red-50 text-red-800 border-red-200'
    }
    return colors[severity] || 'bg-gray-50 text-gray-800'
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading device...</div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">Device not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/devices" className="text-gray-600 hover:text-gray-900 mr-4">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-gray-700">
                AscultiCor
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Device Header */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{device.device_name}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(device.status)}`}>
                    {device.status}
                  </span>
                </div>
                <p className="text-gray-600">
                  {device.device_type.toUpperCase()} • ID: {device.id}
                </p>
                {device.device_groups?.name && (
                  <p className="text-sm text-gray-500 mt-1">
                    Group: {device.device_groups.name}
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={fetchDeviceData}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 uppercase">Last Seen</p>
                  <p className="font-medium">{formatLastSeen(device.last_seen_at)}</p>
                </div>
              </div>
              {device.battery_level && (
                <div className="flex items-center space-x-3">
                  <Battery className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Battery</p>
                    <p className="font-medium">{device.battery_level}%</p>
                  </div>
                </div>
              )}
              {device.signal_strength && (
                <div className="flex items-center space-x-3">
                  <Wifi className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Signal</p>
                    <p className="font-medium">{device.signal_strength} dBm</p>
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-3">
                <Activity className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 uppercase">Sessions</p>
                  <p className="font-medium">{stats?.totalSessions || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="border-b">
              <nav className="flex -mb-px">
                {['overview', 'sessions', 'telemetry', 'alerts', 'settings'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-4 px-6 border-b-2 font-medium text-sm capitalize ${
                      activeTab === tab
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Recent Sessions */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Recent Sessions</h3>
                      <Link 
                        href={`/session/new?device=${deviceId}`}
                        className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        New Session
                      </Link>
                    </div>
                    
                    {device.sessions?.length === 0 ? (
                      <p className="text-gray-500">No sessions yet</p>
                    ) : (
                      <div className="space-y-3">
                        {device.sessions.slice(0, 5).map((session) => (
                          <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium">Session {session.id.slice(0, 8)}</p>
                              <p className="text-sm text-gray-500">
                                {new Date(session.created_at).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center space-x-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                session.status === 'done' ? 'bg-green-100 text-green-800' :
                                session.status === 'streaming' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {session.status}
                              </span>
                              <Link 
                                href={`/session/${session.id}`}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                View
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Active Alerts */}
                  {alerts.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Active Alerts</h3>
                      <div className="space-y-3">
                        {alerts.map((alert) => (
                          <div key={alert.id} className={`p-4 rounded-lg border ${getAlertColor(alert.severity)}`}>
                            <div className="flex items-start">
                              <AlertCircle className="w-5 h-5 mr-3 mt-0.5" />
                              <div>
                                <p className="font-medium">{alert.alert_type}</p>
                                <p className="text-sm mt-1">{alert.message}</p>
                                <p className="text-xs mt-2 opacity-75">
                                  {new Date(alert.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'sessions' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">All Sessions</h3>
                  {device.sessions?.length === 0 ? (
                    <p className="text-gray-500">No sessions recorded</p>
                  ) : (
                    <div className="space-y-3">
                      {device.sessions.map((session) => (
                        <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <p className="font-medium">Session {session.id.slice(0, 8)}</p>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                session.status === 'done' ? 'bg-green-100 text-green-800' :
                                session.status === 'streaming' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {session.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              {new Date(session.created_at).toLocaleString()}
                              {session.ended_at && ` → ${new Date(session.ended_at).toLocaleTimeString()}`}
                            </p>
                            {session.predictions?.length > 0 && (
                              <p className="text-sm text-gray-600 mt-1">
                                {session.predictions.length} predictions
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => generateLLMReport(session.id)}
                              disabled={generatingReport === session.id}
                              className="flex items-center px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              {generatingReport === session.id ? 'Generating...' : 'LLM Report'}
                            </button>
                            <Link 
                              href={`/session/${session.id}`}
                              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              View
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'telemetry' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Device Telemetry (Last 24 Hours)</h3>
                  {telemetry.length === 0 ? (
                    <p className="text-gray-500">No telemetry data available</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 text-sm font-medium text-gray-500">Time</th>
                            <th className="text-left py-2 text-sm font-medium text-gray-500">Temp (°C)</th>
                            <th className="text-left py-2 text-sm font-medium text-gray-500">Battery (V)</th>
                            <th className="text-left py-2 text-sm font-medium text-gray-500">WiFi (dBm)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {telemetry.map((t) => (
                            <tr key={t.id} className="border-b">
                              <td className="py-2 text-sm">
                                {new Date(t.recorded_at).toLocaleString()}
                              </td>
                              <td className="py-2 text-sm">{t.temperature_celsius}°C</td>
                              <td className="py-2 text-sm">{t.battery_voltage}V</td>
                              <td className="py-2 text-sm">{t.wifi_rssi} dBm</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'alerts' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Device Alerts</h3>
                  {alerts.length === 0 ? (
                    <p className="text-gray-500">No active alerts</p>
                  ) : (
                    <div className="space-y-3">
                      {alerts.map((alert) => (
                        <div key={alert.id} className={`p-4 rounded-lg border ${getAlertColor(alert.severity)}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex items-start">
                              <AlertCircle className="w-5 h-5 mr-3 mt-0.5" />
                              <div>
                                <p className="font-medium capitalize">{alert.alert_type}</p>
                                <p className="text-sm mt-1">{alert.message}</p>
                                <p className="text-xs mt-2 opacity-75">
                                  {new Date(alert.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            {!alert.is_resolved && (
                              <button className="text-sm text-blue-600 hover:text-blue-800">
                                Mark Resolved
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Device Information</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Device ID</dt>
                        <dd className="mt-1 text-sm font-mono bg-gray-100 p-2 rounded">{device.id}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Device Type</dt>
                        <dd className="mt-1 text-sm">{device.device_type}</dd>
                      </div>
                      {device.firmware_version && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Firmware Version</dt>
                          <dd className="mt-1 text-sm">{device.firmware_version}</dd>
                        </div>
                      )}
                      {device.hardware_version && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Hardware Version</dt>
                          <dd className="mt-1 text-sm">{device.hardware_version}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {device.notes && (
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Notes</h3>
                      <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">{device.notes}</p>
                    </div>
                  )}

                  <div className="pt-6 border-t">
                    <h3 className="text-lg font-semibold mb-4 text-red-600">Danger Zone</h3>
                    <button className="flex items-center px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Device
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
