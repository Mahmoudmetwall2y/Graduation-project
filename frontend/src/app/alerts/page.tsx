'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { PageSkeleton } from '../components/Skeleton'
import { Bell, CheckCircle, Filter, ShieldAlert } from 'lucide-react'

interface AlertRow {
  id: string
  device_id: string
  alert_type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  metadata: any
  is_resolved: boolean
  created_at: string
  resolved_at: string | null
}

export default function AlertsPage() {
  const supabase = createClientComponentClient()
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all')

  const fetchAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from('device_alerts')
      .select('id, device_id, alert_type, severity, message, metadata, is_resolved, created_at, resolved_at')
      .order('created_at', { ascending: false })

    if (!error) {
      setAlerts(data || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  const resolveAlert = async (alertId: string) => {
    const { data: userResp } = await supabase.auth.getUser()
    await supabase
      .from('device_alerts')
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userResp.user?.id || null,
      })
      .eq('id', alertId)

    fetchAlerts()
  }

  const filtered = alerts.filter((alert) => {
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false
    if (statusFilter === 'open' && alert.is_resolved) return false
    if (statusFilter === 'resolved' && !alert.is_resolved) return false
    return true
  })

  if (loading) {
    return <div className="w-full h-full flex flex-col px-8 py-8"><PageSkeleton /></div>
  }

  return (
    <div className="w-full h-full flex flex-col px-8 py-8 overflow-y-auto">
      <div className="w-full max-w-7xl mx-auto space-y-7">
        <div className="flex items-center justify-between fade-in">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-rose-500/10 to-rose-500/5 ring-1 ring-rose-500/10">
              <Bell className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Device alerts and anomalies</p>
            </div>
          </div>
        </div>

        <div className="page-section">
          <div className="section-header">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <h3 className="section-title">Filters</h3>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
              {(['all', 'info', 'warning', 'critical'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setSeverityFilter(level)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${severityFilter === level
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
              {(['all', 'open', 'resolved'] as const).map((state) => (
                <button
                  key={state}
                  onClick={() => setStatusFilter(state)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === state
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                >
                  {state}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="page-section">
          <div className="section-header">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              <h3 className="section-title">Recent Alerts</h3>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted rounded-lg p-4">
              No alerts match your filters.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((alert) => (
                <div key={alert.id} className="list-row">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${alert.severity === 'critical'
                      ? 'bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                      : alert.severity === 'warning'
                        ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
                        : 'bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
                      }`}>
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{alert.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.alert_type} • Device {alert.device_id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${alert.severity === 'critical' ? 'badge-danger' : alert.severity === 'warning' ? 'badge-warning' : 'badge-info'}`}>
                      {alert.severity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                    {!alert.is_resolved ? (
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Resolve
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Resolved</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
