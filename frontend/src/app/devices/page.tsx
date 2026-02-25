'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Activity, Battery, Wifi, AlertCircle, CheckCircle,
  Clock, ChevronRight, Cpu, X, Eye, Trash2, Copy, Check,
  Terminal, Mic, Heart, Search, Filter, MoreVertical
} from 'lucide-react'
import { PageSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [newDeviceType, setNewDeviceType] = useState('sonocardia-kit')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<any>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'error'>('all')
  const addModalRef = useRef<HTMLDivElement | null>(null)
  const deleteModalRef = useRef<HTMLDivElement | null>(null)
  const addFirstFieldRef = useRef<HTMLInputElement | null>(null)
  const deletePrimaryRef = useRef<HTMLButtonElement | null>(null)

  const router = useRouter()
  const supabase = createClientComponentClient()
  const { showToast } = useToast()
  const channelRef = useRef<any>(null)

  const fetchDevices = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    fetchDevices()

    // Subscribe to real-time device changes via Supabase Realtime
    channelRef.current = supabase
      .channel('devices-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        fetchDevices()
      })
      .subscribe()

    // Poll fallback for environments without Realtime
    const interval = setInterval(fetchDevices, 30000)

    return () => {
      clearInterval(interval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDevices, supabase])

  useEffect(() => {
    if (!showAddModal) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAddModal(false)
        setCredentials(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    setTimeout(() => addFirstFieldRef.current?.focus(), 0)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showAddModal])

  useEffect(() => {
    if (!showDeleteConfirm) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDeleteConfirm(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    setTimeout(() => deletePrimaryRef.current?.focus(), 0)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showDeleteConfirm])

  const createDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeviceName.trim()) return
    setCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_name: newDeviceName, device_type: newDeviceType })
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

  const deleteDevice = async (deviceId: string) => {
    setDeleting(deviceId)
    setError(null)

    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete device')
      }
      setShowDeleteConfirm(null)
      fetchDevices()
      showToast('Device deleted successfully', 'success')
    } catch (error: any) {
      setError(error.message)
      showToast(`Failed to delete: ${error.message}`, 'error')
    } finally {
      setDeleting(null)
    }
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
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

  const getHealthBadge = (device: Device) => {
    if (device.status === 'error') return { label: 'Critical', className: 'badge-danger' }
    if (device.status === 'offline') return { label: 'At Risk', className: 'badge-warning' }
    return { label: 'Healthy', className: 'badge-success' }
  }

  const getDeviceTypeIcon = (type: string) => {
    switch (type) {
      case 'sonocardia-kit': return <Heart className="w-5 h-5 text-primary" />
      case 'esp32':
      case 'esp32-s3':
      case 'esp32-c3': return <Cpu className="w-5 h-5 text-primary" />
      default: return <Cpu className="w-5 h-5 text-primary" />
    }
  }

  const getDeviceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'sonocardia-kit': 'AscultiCor Kit',
      'esp32': 'ESP32',
      'esp32-s3': 'ESP32-S3',
      'esp32-c3': 'ESP32-C3',
      'custom': 'Custom'
    }
    return labels[type] || type.toUpperCase()
  }

  if (loading) {
    return <div className="page-wrapper"><PageSkeleton /></div>
  }

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Devices</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your {devices.length} device{devices.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Add Device
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 fade-in">
            <div className="flex items-center justify-between">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Search & Filter Bar */}
        {devices.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 fade-in">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search devices by name, type, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10 w-full"
              />
            </div>
            <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
              {(['all', 'online', 'offline', 'error'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === status
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        )}

        {devices.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center fade-in">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/15 to-blue-500/10 mx-auto mb-4 flex items-center justify-center">
              <Cpu className="w-7 h-7 text-teal-600" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No devices yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Add your first AscultiCor device to capture live signals for clinical review.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-primary gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Device
            </button>
          </div>
        ) : (() => {
          const filteredDevices = devices.filter(device => {
            const matchesSearch = !searchQuery ||
              device.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              device.device_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
              device.id.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesStatus = statusFilter === 'all' || device.status === statusFilter
            return matchesSearch && matchesStatus
          })

          if (filteredDevices.length === 0) {
            return (
              <div className="bg-card border border-border rounded-xl p-12 text-center fade-in">
                <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No devices match your filter</p>
                <button onClick={() => { setSearchQuery(''); setStatusFilter('all') }} className="text-sm text-primary mt-2 hover:text-primary/80">
                  Clear filters
                </button>
              </div>
            )
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDevices.map((device, i) => (
                <div
                  key={device.id}
                  className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 slide-up"
                  style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'backwards' }}
                >
                  <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        {getDeviceTypeIcon(device.device_type)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{device.device_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {getDeviceTypeLabel(device.device_type)} &bull; {device.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${device.status === 'online' ? 'badge-success' :
                        device.status === 'error' ? 'badge-danger' : 'badge-neutral'
                        }`}>
                        <span className={`pulse-dot ${device.status}`} style={{ width: '8px', height: '8px' }} />
                        {device.status}
                      </span>
                      <span className={`badge ${getHealthBadge(device).className}`}>
                        {getHealthBadge(device).label}
                      </span>
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === device.id ? null : device.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          aria-label="Open device menu"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === device.id && (
                          <div className="absolute right-0 mt-2 w-36 rounded-lg border border-border bg-card shadow-lg z-10">
                            <Link
                              href={`/devices/${device.id}`}
                              className="block px-3 py-2 text-sm text-foreground hover:bg-accent"
                              onClick={() => setOpenMenuId(null)}
                            >
                              View
                            </Link>
                            <button
                              onClick={() => {
                                setOpenMenuId(null)
                                setShowDeleteConfirm(device.id)
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-emerald-500' : device.status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
                        <span>Last seen {formatLastSeen(device.last_seen_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Activity className="w-3.5 h-3.5" />
                        <span>{device.sessions?.[0]?.count || 0} sessions</span>
                      </div>
                      {device.battery_level > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Battery className="w-3.5 h-3.5" />
                          <span>{device.battery_level}%</span>
                        </div>
                      )}
                      {device.signal_strength !== 0 && device.signal_strength && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Wifi className="w-3.5 h-3.5" />
                          <span>{device.signal_strength} dBm</span>
                        </div>
                      )}
                    </div>

                    {device.device_groups?.name && (
                      <p className="text-xs text-muted-foreground mb-4 badge badge-neutral w-fit">
                        {device.device_groups.name}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-border flex">
                    <Link
                      href={`/devices/${device.id}`}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-primary hover:bg-accent transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)} />
            <div
              ref={deleteModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-device-title"
              className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 fade-in"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
                </div>
                <h2 id="delete-device-title" className="text-xl font-bold text-foreground">Delete Device?</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  This will permanently delete this device and all its associated sessions, telemetry, and predictions. This action cannot be undone.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  ref={deletePrimaryRef}
                  onClick={() => showDeleteConfirm && deleteDevice(showDeleteConfirm)}
                  disabled={deleting === showDeleteConfirm}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting === showDeleteConfirm ? 'Deleting...' : 'Delete Device'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Device Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowAddModal(false); setCredentials(null) }} />
            <div
              ref={addModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-device-title"
              className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-6 fade-in max-h-[90vh] overflow-y-auto"
            >
              {!credentials ? (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 id="add-device-title" className="text-xl font-bold text-foreground">Add New Device</h2>
                    <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-sm text-red-700 dark:text-red-400">
                      {error}
                    </div>
                  )}

                  <form onSubmit={createDevice} className="space-y-4">
                    <div className="form-group">
                      <label className="block text-sm font-medium text-foreground mb-1.5">Device Name</label>
                      <input
                        type="text"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        placeholder="e.g., Patient Room 101"
                        required
                        className="input-field"
                        ref={addFirstFieldRef}
                      />
                      <p className="form-hint">Use a location or patient-friendly label for quick identification.</p>
                    </div>

                    <div className="form-group">
                      <label className="block text-sm font-medium text-foreground mb-1.5">Device Type</label>
                      <select
                        value={newDeviceType}
                        onChange={(e) => setNewDeviceType(e.target.value)}
                        className="input-field"
                      >
                        <optgroup label="Complete Kits">
                          <option value="sonocardia-kit">AscultiCor Kit (ESP32 + AD8232 + MAX9814)</option>
                        </optgroup>
                        <optgroup label="Microcontrollers">
                          <option value="esp32">ESP32-WROOM-32</option>
                          <option value="esp32-s3">ESP32-S3</option>
                          <option value="esp32-c3">ESP32-C3</option>
                        </optgroup>
                        <optgroup label="Custom">
                          <option value="custom">Custom Device</option>
                        </optgroup>
                      </select>
                      <p className="form-hint">Choose the hardware bundle to generate the correct provisioning details.</p>
                    </div>

                    {/* Hardware info callout */}
                    {newDeviceType === 'sonocardia-kit' && (
                      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                        <p className="text-xs font-semibold text-primary mb-1.5">Included Components</p>
                        <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Cpu className="w-3 h-3 text-primary" />
                            <span>ESP32-WROOM-32</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Heart className="w-3 h-3 text-red-500" />
                            <span>AD8232 ECG Module</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Mic className="w-3 h-3 text-blue-500" />
                            <span>MAX9814 Microphone</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-green-500" />
                            <span>Stethoscope Head</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                      <button type="button" onClick={() => setShowAddModal(false)} className="btn-ghost">Cancel</button>
                      <button type="submit" disabled={creating} className="btn-primary gap-2">
                        {creating && <Activity className="w-4 h-4 animate-spin" />}
                        {creating ? 'Creating...' : 'Create Device'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">Device Created!</h2>
                    <p className="text-sm text-muted-foreground mt-1">Save these credentials — you&apos;ll only see them once</p>
                  </div>

                  <div className="bg-muted rounded-xl p-4 space-y-3 mb-6">
                    {[
                      { label: 'Device ID', value: credentials.device_id, key: 'device_id' },
                      { label: 'Secret Key', value: credentials.device_secret, key: 'secret' },
                      { label: 'Organization ID', value: credentials.org_id, key: 'org_id' },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{item.label}</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 block text-sm bg-background p-2.5 rounded-lg border border-border font-mono break-all text-foreground">
                            {item.value}
                          </code>
                          <button
                            onClick={() => copyToClipboard(item.value, item.key)}
                            className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Copy to clipboard"
                          >
                            {copiedField === item.key ? (
                              <Check className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Serial Provisioning Instructions */}
                  <div className="rounded-xl bg-gray-900 dark:bg-gray-950 p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      <p className="text-sm font-semibold text-white">Flash to ESP32 via Serial Monitor</p>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">
                      Open Arduino IDE Serial Monitor at 115200 baud and send these commands:
                    </p>
                    <div className="font-mono text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 select-none">&gt;</span>
                        <code className="text-emerald-400">SET device_id {credentials.device_id}</code>
                        <button
                          onClick={() => copyToClipboard(`SET device_id ${credentials.device_id}`, 'cmd_device')}
                          className="ml-auto shrink-0 p-1 rounded text-gray-500 hover:text-white transition-colors"
                        >
                          {copiedField === 'cmd_device' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 select-none">&gt;</span>
                        <code className="text-emerald-400">SET device_secret {credentials.device_secret}</code>
                        <button
                          onClick={() => copyToClipboard(`SET device_secret ${credentials.device_secret}`, 'cmd_secret')}
                          className="ml-auto shrink-0 p-1 rounded text-gray-500 hover:text-white transition-colors"
                        >
                          {copiedField === 'cmd_secret' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 select-none">&gt;</span>
                        <code className="text-emerald-400">SET org_id {credentials.org_id}</code>
                        <button
                          onClick={() => copyToClipboard(`SET org_id ${credentials.org_id}`, 'cmd_org')}
                          className="ml-auto shrink-0 p-1 rounded text-gray-500 hover:text-white transition-colors"
                        >
                          {copiedField === 'cmd_org' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 select-none">&gt;</span>
                        <code className="text-yellow-400">SET mqtt_host YOUR_SERVER_IP</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 select-none">&gt;</span>
                        <code className="text-yellow-400">SET wifi_ssid YOUR_WIFI_NAME</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 select-none">&gt;</span>
                        <code className="text-yellow-400">SET wifi_pass YOUR_WIFI_PASSWORD</code>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
                        <span className="text-gray-500 select-none">&gt;</span>
                        <code className="text-blue-400">REBOOT</code>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      <span className="text-emerald-400">Green</span> = auto-filled from credentials &bull;
                      <span className="text-yellow-400 ml-1">Yellow</span> = you need to fill in
                    </p>
                  </div>

                  <button
                    onClick={() => { setShowAddModal(false); setCredentials(null) }}
                    className="btn-primary w-full"
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
