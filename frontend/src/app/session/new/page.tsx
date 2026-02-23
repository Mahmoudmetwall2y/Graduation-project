'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Heart, Cpu, FileText, ArrowRight, ChevronLeft, Activity } from 'lucide-react'

export default function NewSessionPage() {
  const [deviceId, setDeviceId] = useState('')
  const [devices, setDevices] = useState<any[]>([])
  const [patientId, setPatientId] = useState('')
  const [patients, setPatients] = useState<any[]>([])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingPatients, setLoadingPatients] = useState(true)
  const [fetchPatientsError, setFetchPatientsError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const fetchDevices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setDevices(data || [])
      if (data && data.length > 0) {
        setDeviceId(data[0].id)
      }
      setFetchError(null)
    } catch (error) {
      console.error('Error fetching devices:', error)
      setFetchError('Failed to load devices. Please check your connection.')
    } finally {
      setLoadingDevices(false)
    }
  }, [supabase])

  const fetchPatients = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setPatients(data || [])
      setFetchPatientsError(null)
    } catch (error) {
      console.error('Error fetching patients:', error)
      setFetchPatientsError('Failed to load patients. Please check your connection.')
    } finally {
      setLoadingPatients(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchDevices()
    fetchPatients()
  }, [fetchDevices, fetchPatients])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          org_id: profile.org_id,
          created_by: user.id,
          device_id: deviceId,
          patient_id: patientId || null,
          notes: notes || null,
          status: 'created'
        })
        .select()
        .single()

      if (sessionError) throw sessionError
      router.push(`/session/${session.id}`)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrapper">
      <div className="page-content">

        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="text-center mb-8 fade-in">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Heart className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">New Session</h1>
            <p className="text-sm text-muted-foreground mt-1">Start a new cardiac monitoring session</p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 fade-in">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5 slide-up">
            <div>
              <label htmlFor="device" className="block text-sm font-medium text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                  Select Device
                </span>
              </label>
              <select
                id="device"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                required
                className="input-field"
              >
                {devices.length === 0 ? (
                  <option value="">No devices available</option>
                ) : (
                  devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.device_name} ({device.device_type})
                    </option>
                  ))
                )}
              </select>
              {loadingDevices ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  <Activity className="w-4 h-4 animate-spin inline mr-2" />
                  Loading devices...
                </div>
              ) : fetchError ? (
                <div className="text-center py-2">
                  <p className="text-sm text-destructive mb-2">{fetchError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadingDevices(true)
                      fetchDevices()
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Retry loading devices
                  </button>
                </div>
              ) : devices.length === 0 ? (
                <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  Please <Link href="/devices" className="text-primary underline">register a device</Link> first.
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="patient" className="block text-sm font-medium text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-muted-foreground" />
                  Patient <span className="text-muted-foreground font-normal">(Optional)</span>
                </span>
              </label>
              <select
                id="patient"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="input-field"
              >
                <option value="">No patient selected</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name}{patient.mrn ? ` (MRN ${patient.mrn})` : ''}
                  </option>
                ))}
              </select>
              {loadingPatients ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  <Activity className="w-4 h-4 animate-spin inline mr-2" />
                  Loading patients...
                </div>
              ) : fetchPatientsError ? (
                <div className="text-center py-2">
                  <p className="text-sm text-destructive mb-2">{fetchPatientsError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadingPatients(true)
                      fetchPatients()
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Retry loading patients
                  </button>
                </div>
              ) : patients.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No patients yet. <Link href="/patients" className="text-primary underline">Add a patient</Link> to link sessions.
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Notes <span className="text-muted-foreground font-normal">(Optional)</span>
                </span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="input-field resize-none"
                placeholder="Patient info, auscultation point, etc..."
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || devices.length === 0}
                className="btn-primary gap-2"
              >
                {loading ? (
                  <Activity className="w-4 h-4 animate-spin" />
                ) : null}
                {loading ? 'Creating...' : 'Start Session'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
