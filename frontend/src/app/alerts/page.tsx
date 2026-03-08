'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { PageSkeleton } from '../components/Skeleton'
import { Bell, CheckCircle, Filter, ShieldAlert } from 'lucide-react'
import { DataList, DataListRow, DataListCell } from '../../components/ui/DataList'

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
    return <div className="page-wrapper"><PageSkeleton /></div>
  }

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Alerts</h1>
            <p className="text-sm text-muted-foreground mt-1">Device alerts and anomalies</p>
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

        {filtered.length === 0 ? (
          <div className="text-sm text-hud-cyan/60 bg-hud-cyan/5 border border-hud-cyan/20 rounded-xl p-8 text-center slide-up mt-6">
            No alerts match your filters.
          </div>
        ) : (
          <div className="slide-up mt-6" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
            <DataList
              title="Recent Alerts"
              headers={['Alert', 'Severity', 'Time', 'Action']}
              icon={<ShieldAlert className="w-5 h-5 text-hud-cyan" />}
              action={<span className="text-xs text-hud-cyan font-mono bg-hud-cyan/10 px-3 py-1 rounded-full border border-hud-cyan/30">{filtered.length} ALERTS</span>}
            >
              {filtered.map((alert) => (
                <DataListRow key={alert.id}>
                  <DataListCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center border shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] ${alert.severity === 'critical'
                        ? 'bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                        : alert.severity === 'warning'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                          : 'bg-hud-cyan/10 border-hud-cyan/30 text-hud-cyan shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                        }`}>
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white/90">{alert.message}</p>
                        <p className="text-xs text-hud-cyan/60 font-mono mt-0.5 uppercase tracking-wider">
                          {alert.alert_type} • DEVICE {alert.device_id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </DataListCell>
                  <DataListCell>
                    <span className={`badge ${alert.severity === 'critical' ? 'badge-danger pulse' : alert.severity === 'warning' ? 'badge-warning' : 'badge-info'}`}>
                      {alert.severity}
                    </span>
                  </DataListCell>
                  <DataListCell>
                    <span className="text-xs text-white/50 font-mono">
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                  </DataListCell>
                  <DataListCell isLast>
                    {!alert.is_resolved ? (
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-mono tracking-widest text-[#00f0ff] hover:text-white transition-all bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 px-3 py-1.5 rounded-lg border border-[#00f0ff]/30 shadow-[0_0_10px_rgba(0,240,255,0.1)] justify-center min-w-[100px]"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        RESOLVE
                      </button>
                    ) : (
                      <span className="text-xs text-white/30 font-mono inline-block text-center min-w-[100px] tracking-widest">RESOLVED</span>
                    )}
                  </DataListCell>
                </DataListRow>
              ))}
            </DataList>
          </div>
        )}
      </div>
    </div>
  )
}
