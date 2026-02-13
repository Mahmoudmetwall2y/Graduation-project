'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Plus, 
  Activity, 
  Battery, 
  Wifi, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  ChevronRight
} from 'lucide-react'

interface Device {
  id: string
  device_name: string
  device_type: string
  status: string
  last_seen_at: string
  battery_level: number
  signal_strength: number
  device_groups: { name: string }
  sessions: { count: number }[]
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [newDeviceType, setNewDeviceType] = useState('esp32')
  const [creating, setCreating] = useState(false)
  const [credentials, setCredentials] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClientComponentClient()

  // Polling for real-time updates (free alternative to Supabase Realtime)
  useEffect(() => {
    fetchDevices()
    
    // Poll every 3 seconds for updates
    const interval = setInterval(fetchDevices, 3000)
    
    return () => clearInterval(interval)
  }, [])

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/devices')
      if (!response.ok) throw new Error('Failed to fetch devices')
      
      const data = await response.json()
      setDevices(data.devices || [])
    } catch (error) {
      console.error('Error fetching devices:', error)
      setError('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  const createDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeviceName.trim()) return

    setCreating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: newDeviceName,
          device_type: newDeviceType
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create device')
      }

      const data = await response.json()
      setCredentials(data.credentials)
      setNewDeviceName('')
      fetchDevices()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setCreating(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      online: 'bg-green-100 text-green-800',
      offline: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800',
      maintenance: 'bg-yellow-100 text-yellow-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="w-4 h-4" />
      case 'error':
        return <AlertCircle className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const formatLastSeen = (date: string) => {
    if (!date) return 'Never'
    const lastSeen = new Date(date)
    const now = new Date()
    const diff = Math.floor((now.getTime() - lastSeen.getTime()) / 1000)
    
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading devices...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-gray-700">
                AscultiCor
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link href="/" className="text-blue-600 hover:text-blue-800">
              ← Back to Dashboard
            </Link>
          </div>

          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Device Management</h1>
              <p className="text-gray-600 mt-1">
                Manage your {devices.length} ESP32 device{devices.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Device
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-md">
              {error}
            </div>
          )}

          {devices.length === 0 ? (
            <div className="bg-white shadow rounded-lg p-8 text-center">
              <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No devices yet</h3>
              <p className="text-gray-500 mb-4">
                Add your first ESP32 device to start monitoring patients
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Your First Device
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {device.device_name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {device.device_type.toUpperCase()} • ID: {device.id.slice(0, 8)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          device.status
                        )}`}
                      >
                        {getStatusIcon(device.status)}
                        <span className="ml-1 capitalize">{device.status}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 mr-2" />
                        {formatLastSeen(device.last_seen_at)}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Activity className="w-4 h-4 mr-2" />
                        {device.sessions?.[0]?.count || 0} sessions
                      </div>
                      {device.battery_level && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Battery className="w-4 h-4 mr-2" />
                          {device.battery_level}%
                        </div>
                      )}
                      {device.signal_strength && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Wifi className="w-4 h-4 mr-2" />
                          {device.signal_strength} dBm
                        </div>
                      )}
                    </div>

                    {device.device_groups?.name && (
                      <p className="text-sm text-gray-500 mb-4">
                        Group: {device.device_groups.name}
                      </p>
                    )}

                    <div className="flex space-x-2">
                      <Link
                        href={`/devices/${device.id}`}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100"
                      >
                        View Dashboard
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            {!credentials ? (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Device</h2>
                
                {error && (
                  <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={createDevice}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Device Name
                    </label>
                    <input
                      type="text"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      placeholder="e.g., Patient Room 101"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Device Type
                    </label>
                    <select
                      value={newDeviceType}
                      onChange={(e) => setNewDeviceType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="esp32">ESP32</option>
                      <option value="esp32-s3">ESP32-S3</option>
                      <option value="esp32-c3">ESP32-C3</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 text-gray-700 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creating ? 'Creating...' : 'Create Device'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <h2 className="text-xl font-bold text-gray-900">Device Created!</h2>
                  <p className="text-gray-600">Save these credentials - you'll only see them once</p>
                </div>

                <div className="bg-gray-50 rounded-md p-4 mb-4 space-y-2">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Device ID</label>
                    <code className="block text-sm bg-white p-2 rounded border mt-1 font-mono">
                      {credentials.device_id}
                    </code>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Secret Key</label>
                    <code className="block text-sm bg-white p-2 rounded border mt-1 font-mono break-all">
                      {credentials.device_secret}
                    </code>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Organization ID</label>
                    <code className="block text-sm bg-white p-2 rounded border mt-1 font-mono">
                      {credentials.org_id}
                    </code>
                  </div>
                </div>

                <div className="text-sm text-gray-600 mb-4">
                  <p className="font-medium mb-1">Next Steps:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Copy these credentials</li>
                    <li>Update your ESP32 firmware</li>
                    <li>Flash the device</li>
                    <li>Power on to connect</li>
                  </ol>
                </div>

                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setCredentials(null)
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
