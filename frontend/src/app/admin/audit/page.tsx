'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { PageSkeleton } from '../../components/Skeleton'
import { ShieldAlert, Search } from 'lucide-react'

interface AuditLog {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  metadata: any
  created_at: string
  user_id: string | null
}

export default function AuditLogPage() {
  const supabase = createClientComponentClient()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, metadata, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(200)

    if (!error) {
      setLogs(data || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 60000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  const filtered = logs.filter((log) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      log.action.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      (log.entity_id || '').toLowerCase().includes(q) ||
      JSON.stringify(log.metadata || {}).toLowerCase().includes(q)
    )
  })

  if (loading) {
    return <div className="page-wrapper"><PageSkeleton /></div>
  }

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">Security and compliance events</p>
          </div>
        </div>

        <div className="page-section">
          <div className="section-header">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              <h3 className="section-title">Recent Activity</h3>
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search action, entity, or metadata..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted rounded-lg p-4">
              No audit logs found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((log) => (
                <div key={log.id} className="list-row">
                  <div>
                    <p className="text-sm font-medium text-foreground">{log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.entity_type}
                      {log.entity_id ? ` • ${log.entity_id.slice(0, 8)}` : ''}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
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
