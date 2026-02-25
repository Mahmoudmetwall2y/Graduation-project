'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import {
  Calendar,
  ChevronRight,
  Filter,
  Heart,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import { PageSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

interface SessionRow {
  id: string
  status: string
  created_at: string
  ended_at: string | null
  device_id: string
  patient_id: string | null
  device?: { id: string; device_name: string } | null
  patient?: { id: string; full_name: string } | null
}

interface Device {
  id: string
  device_name: string
}

interface Patient {
  id: string
  full_name: string
}

interface SavedView {
  id: string
  name: string
  filters: any
}

export default function SessionsPage() {
  const supabase = createClientComponentClient()
  const { showToast } = useToast()

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [savedViews, setSavedViews] = useState<SavedView[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingView, setSavingView] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [patientId, setPatientId] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [predictionLabel, setPredictionLabel] = useState('')
  const [viewName, setViewName] = useState('')

  const fetchLookups = useCallback(async () => {
    const [devicesRes, patientsRes, viewsRes] = await Promise.all([
      supabase.from('devices').select('id, device_name').order('created_at', { ascending: false }),
      supabase.from('patients').select('id, full_name').order('created_at', { ascending: false }),
      supabase.from('saved_views').select('id, name, filters').eq('view_type', 'sessions').order('created_at', { ascending: false }),
    ])

    if (!devicesRes.error) setDevices(devicesRes.data || [])
    if (!patientsRes.error) setPatients(patientsRes.data || [])
    if (!viewsRes.error) setSavedViews(viewsRes.data || [])
  }, [supabase])

  const buildSessionQuery = useCallback(async () => {
    let sessionIds: string[] | null = null

    if (predictionLabel) {
      const { data: predData, error: predError } = await supabase
        .from('predictions')
        .select('session_id')
        .or(`output_json->>label.eq.${predictionLabel},output_json->>prediction.eq.${predictionLabel}`)

      if (predError) throw predError
      sessionIds = Array.from(new Set((predData || []).map((p: any) => p.session_id)))
      if (sessionIds.length === 0) {
        return []
      }
    }

    let query = supabase
      .from('sessions')
      .select('id, status, created_at, ended_at, device_id, patient_id, device:devices(id, device_name), patient:patients(id, full_name)')
      .order('created_at', { ascending: false })

    if (deviceId) query = query.eq('device_id', deviceId)
    if (patientId) query = query.eq('patient_id', patientId)
    if (status) query = query.eq('status', status)
    if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString())
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      query = query.lte('created_at', end.toISOString())
    }
    if (sessionIds) query = query.in('id', sessionIds)

    const { data, error: sessionsError } = await query
    if (sessionsError) throw sessionsError
    const normalized = (data || []).map((row: any) => ({
      ...row,
      device: Array.isArray(row.device) ? row.device[0] : row.device,
      patient: Array.isArray(row.patient) ? row.patient[0] : row.patient,
    }))
    return normalized
  }, [dateFrom, dateTo, deviceId, patientId, predictionLabel, status, supabase])

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await buildSessionQuery()
      setSessions(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [buildSessionQuery])

  const getStatusBadge = (status: string) => {
    const map: Record<string, { badge: string; dot: string }> = {
      created: { badge: 'badge-neutral', dot: 'bg-gray-400' },
      streaming: { badge: 'badge-info', dot: 'bg-sky-500' },
      processing: { badge: 'badge-warning', dot: 'bg-amber-500' },
      done: { badge: 'badge-success', dot: 'bg-emerald-500' },
      error: { badge: 'badge-danger', dot: 'bg-red-500' },
    }
    return map[status] || { badge: 'badge-neutral', dot: 'bg-gray-400' }
  }

  useEffect(() => {
    fetchLookups()
  }, [fetchLookups])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 30000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter((session) =>
      session.id.toLowerCase().includes(q) ||
      session.device?.device_name?.toLowerCase().includes(q) ||
      session.patient?.full_name?.toLowerCase().includes(q)
    )
  }, [sessions, searchQuery])

  const resetFilters = () => {
    setSearchQuery('')
    setDeviceId('')
    setPatientId('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setPredictionLabel('')
  }

  const saveView = async () => {
    if (!viewName.trim()) return
    setSavingView(true)
    try {
      const { data: userResp, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!userResp.user) throw new Error('Not authenticated')

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', userResp.user.id)
        .single()

      if (profileError) throw profileError

      const filters = { deviceId, patientId, status, dateFrom, dateTo, predictionLabel }
      const { error: insertError } = await supabase
        .from('saved_views')
        .insert({
          org_id: profile.org_id,
          user_id: userResp.user.id,
          view_type: 'sessions',
          name: viewName.trim(),
          filters,
        })

      if (insertError) throw insertError
      setViewName('')
      fetchLookups()
      showToast('View saved', 'success')
    } catch (err: any) {
      showToast(`Failed to save view: ${err.message}`, 'error')
    } finally {
      setSavingView(false)
    }
  }

  const applyView = (view: SavedView) => {
    const filters = view.filters || {}
    setDeviceId(filters.deviceId || '')
    setPatientId(filters.patientId || '')
    setStatus(filters.status || '')
    setDateFrom(filters.dateFrom || '')
    setDateTo(filters.dateTo || '')
    setPredictionLabel(filters.predictionLabel || '')
  }

  const deleteView = async (viewId: string) => {
    try {
      const { error: deleteError } = await supabase.from('saved_views').delete().eq('id', viewId)
      if (deleteError) throw deleteError
      fetchLookups()
      showToast('View deleted', 'success')
    } catch (err: any) {
      showToast(`Failed to delete view: ${err.message}`, 'error')
    }
  }

  if (loading && sessions.length === 0) {
    return <div className="page-wrapper"><PageSkeleton /></div>
  }

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Sessions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Filter and review recorded sessions
            </p>
          </div>
          <Link href="/session/new" className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            New Session
          </Link>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 fade-in">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="page-section slide-up">
          <div className="section-header">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <h3 className="section-title">Filters</h3>
            </div>
            <button onClick={resetFilters} className="text-sm text-primary hover:text-primary/80">
              Reset
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by ID, device, patient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="input-field">
              <option value="">All devices</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>{device.device_name}</option>
              ))}
            </select>

            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="input-field">
              <option value="">All patients</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.full_name}</option>
              ))}
            </select>

            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field">
              <option value="">Any status</option>
              <option value="created">Created</option>
              <option value="streaming">Streaming</option>
              <option value="processing">Processing</option>
              <option value="done">Done</option>
              <option value="error">Error</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field"
            />

            <select value={predictionLabel} onChange={(e) => setPredictionLabel(e.target.value)} className="input-field">
              <option value="">Any prediction</option>
              <option value="Normal">Normal</option>
              <option value="Abnormal">Abnormal</option>
              <option value="Murmur">Murmur</option>
              <option value="Extrasystole">Extrasystole</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div className="page-section slide-up" style={{ animationDelay: '0.05s', animationFillMode: 'backwards' }}>
          <div className="section-header">
            <div>
              <h3 className="section-title">Saved Views</h3>
              <p className="text-xs text-muted-foreground">Save and reuse your filters</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1">
              <input
                type="text"
                placeholder="View name"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                className="input-field"
              />
            </div>
            <button onClick={saveView} disabled={savingView || !viewName.trim()} className="btn-primary gap-2">
              <Save className="w-4 h-4" />
              {savingView ? 'Saving...' : 'Save View'}
            </button>
          </div>

          {savedViews.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-4">No saved views yet.</p>
          ) : (
            <div className="divide-y divide-border mt-4">
              {savedViews.map((view) => (
                <div key={view.id} className="list-row">
                  <button
                    onClick={() => applyView(view)}
                    className="text-sm font-medium text-foreground hover:text-primary text-left"
                  >
                    {view.name}
                  </button>
                  <button
                    onClick={() => deleteView(view.id)}
                    className="text-sm text-red-500 hover:text-red-600 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-section slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'backwards' }}>
          <div className="section-header">
            <div>
              <h3 className="section-title">Results</h3>
              <p className="text-xs text-muted-foreground">{filteredSessions.length} sessions</p>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted rounded-lg p-4">
              No sessions match your filters.
            </div>
          ) : (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-3 px-6 table-header">
                <span>Session</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-border mt-2">
                {filteredSessions.map((session) => {
                  const statusMeta = getStatusBadge(session.status)
                  return (
                    <Link key={session.id} href={`/session/${session.id}`} className="list-row group">
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
                            {session.patient?.full_name ? ` - ${session.patient.full_name}` : ''}
                            {session.device?.device_name ? ` - ${session.device.device_name}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`badge ${statusMeta.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                          {session.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
