'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  Shield, ShieldAlert, Clock, Activity,
  FileText, Users, Cpu, AlertTriangle,
  Heart, TrendingUp, Server, Database
} from 'lucide-react'
import { PageSkeleton } from '../components/Skeleton'

interface AuditLog {
  id: string
  action: string
  entity_type: string
  entity_id: string
  metadata: any
  created_at: string
}

interface SystemStats {
  totalDevices: number
  onlineDevices: number
  totalSessions: number
  totalPredictions: number
  totalUsers: number
}

export default function AdminPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [systemStats, setSystemStats] = useState<SystemStats>({
    totalDevices: 0, onlineDevices: 0, totalSessions: 0, totalPredictions: 0, totalUsers: 0
  })
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview')
  const supabase = createClientComponentClient()

  const checkAdmin = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin') {
        setIsAdmin(true)
        fetchLogs()
        fetchSystemStats()
      } else {
        setLoading(false)
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => {
    checkAdmin()
  }, [checkAdmin])

  const fetchSystemStats = async () => {
    try {
      const [devicesRes, onlineRes, sessionsRes, predsRes, usersRes] = await Promise.all([
        supabase.from('devices').select('id', { count: 'exact', head: true }),
        supabase.from('devices').select('id', { count: 'exact', head: true }).eq('status', 'online'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }),
        supabase.from('predictions').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ])

      setSystemStats({
        totalDevices: devicesRes.count || 0,
        onlineDevices: onlineRes.count || 0,
        totalSessions: sessionsRes.count || 0,
        totalPredictions: predsRes.count || 0,
        totalUsers: usersRes.count || 0,
      })
    } catch (err) {
      console.error('Error fetching system stats:', err)
    }
  }

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setLogs(data || [])
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const getActionIcon = (action: string) => {
    if (action.includes('device')) return <Cpu className="w-4 h-4" />
    if (action.includes('user') || action.includes('login')) return <Users className="w-4 h-4" />
    if (action.includes('session')) return <Activity className="w-4 h-4" />
    if (action.includes('alert')) return <AlertTriangle className="w-4 h-4" />
    return <FileText className="w-4 h-4" />
  }

  const getActionBadge = (action: string) => {
    if (action.includes('created')) return 'badge-success'
    if (action.includes('deleted') || action.includes('error')) return 'badge-danger'
    if (action.includes('updated')) return 'badge-info'
    return 'badge-neutral'
  }

  if (loading) {
    return <div className="page-wrapper"><PageSkeleton /></div>
  }

  if (!isAdmin) {
    return (
      <div className="page-wrapper">
        <div className="page-content flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <ShieldAlert className="w-14 h-14 text-destructive/50 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
            <p className="text-sm text-muted-foreground">Admin privileges are required to view this page.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">

        {/* Header */}
        <div className="fade-in">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Admin Panel</h1>
              <p className="text-sm text-muted-foreground">System overview, health, and audit logs</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit fade-in">
          {(['overview', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
            >
              {tab === 'overview' ? 'System Overview' : 'Audit Logs'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' ? (
          <>
            {/* System Health Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 fade-in">
              {[
                { label: 'Total Devices', value: systemStats.totalDevices, icon: Cpu, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
                { label: 'Online Now', value: systemStats.onlineDevices, icon: Server, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                { label: 'Sessions', value: systemStats.totalSessions, icon: Activity, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' },
                { label: 'Predictions', value: systemStats.totalPredictions, icon: Heart, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30' },
                { label: 'Users', value: systemStats.totalUsers, icon: Users, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
              ].map(stat => (
                <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase">{stat.label}</span>
                    <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Quick Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 fade-in">
              {/* Device Health */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-foreground">Device Health</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Online</span>
                      <span className="font-medium text-foreground">
                        {systemStats.totalDevices > 0
                          ? `${Math.round((systemStats.onlineDevices / systemStats.totalDevices) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${systemStats.totalDevices > 0 ? (systemStats.onlineDevices / systemStats.totalDevices) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{systemStats.onlineDevices} online</span>
                    <span>{systemStats.totalDevices - systemStats.onlineDevices} offline</span>
                  </div>
                </div>
              </div>

              {/* Activity Summary */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <h3 className="font-semibold text-foreground">Activity Summary</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Predictions per Session</span>
                    <span className="text-sm font-semibold text-foreground">
                      {systemStats.totalSessions > 0
                        ? (systemStats.totalPredictions / systemStats.totalSessions).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Sessions per Device</span>
                    <span className="text-sm font-semibold text-foreground">
                      {systemStats.totalDevices > 0
                        ? (systemStats.totalSessions / systemStats.totalDevices).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Devices per User</span>
                    <span className="text-sm font-semibold text-foreground">
                      {systemStats.totalUsers > 0
                        ? (systemStats.totalDevices / systemStats.totalUsers).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Recent Audit Events</span>
                    <span className="text-sm font-semibold text-foreground">{logs.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity (mini) */}
            <div className="bg-card border border-border rounded-xl slide-up">
              <div className="p-6 pb-0 flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Recent Activity</h2>
                <button onClick={() => setActiveTab('logs')} className="text-xs text-primary hover:text-primary/80 font-medium">
                  View all →
                </button>
              </div>
              {logs.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border mt-4">
                  {logs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-muted">
                          {getActionIcon(log.action)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{log.action.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {log.entity_type} • {log.entity_id?.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 fade-in">
              {[
                { label: 'Total Events', value: logs.length, icon: Activity, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30' },
                { label: 'Device Events', value: logs.filter(l => l.entity_type === 'device').length, icon: Cpu, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
                { label: 'Session Events', value: logs.filter(l => l.entity_type === 'session').length, icon: FileText, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' },
                { label: 'Today', value: logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
              ].map(stat => (
                <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase">{stat.label}</span>
                    <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Audit Logs */}
            <div className="bg-card border border-border rounded-xl slide-up">
              <div className="p-6 pb-0 flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Audit Logs</h2>
                <span className="text-xs text-muted-foreground">Latest {logs.length} events</span>
              </div>

              {logs.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No audit logs found.</p>
                </div>
              ) : (
                <div className="divide-y divide-border mt-4">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-muted">
                          {getActionIcon(log.action)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{log.action.replace(/_/g, ' ')}</p>
                            <span className={`badge ${getActionBadge(log.action)} text-[10px]`}>
                              {log.entity_type}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ID: {log.entity_id?.slice(0, 8)}
                            {log.metadata?.device_name && ` • ${log.metadata.device_name}`}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
