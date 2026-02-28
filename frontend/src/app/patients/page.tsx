'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import {
  Plus,
  Search,
  UserRound,
  Calendar,
  Hash,
  FileText,
  X,
  Activity,
  Trash2,
  ChevronRight
} from 'lucide-react'
import { PageSkeleton } from '../components/Skeleton'
import { ConfirmModal } from '../components/ConfirmModal'

interface Patient {
  id: string
  full_name: string
  mrn: string | null
  dob: string | null
  sex: 'female' | 'male' | 'other' | 'unknown' | null
  notes: string | null
  created_at: string
}

export default function PatientsPage() {
  const supabase = createClientComponentClient()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const addModalRef = useRef<HTMLDivElement | null>(null)
  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  const [fullName, setFullName] = useState('')
  const [mrn, setMrn] = useState('')
  const [dob, setDob] = useState('')
  const [sex, setSex] = useState<'female' | 'male' | 'other' | 'unknown'>('unknown')
  const [notes, setNotes] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null)

  const fetchPatients = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setPatients(data || [])
      setError(null)

      const { data: userResp } = await supabase.auth.getUser()
      if (userResp?.user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', userResp.user.id).single()
        setIsAdmin(profile?.role === 'admin')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load patients')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchPatients()
  }, [fetchPatients])

  useEffect(() => {
    if (!showAddModal) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAddModal(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    setTimeout(() => firstFieldRef.current?.focus(), 0)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showAddModal])

  const resetForm = () => {
    setFullName('')
    setMrn('')
    setDob('')
    setSex('unknown')
    setNotes('')
  }

  const createPatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) return
    setCreating(true)
    setError(null)

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

      const { error: insertError } = await supabase
        .from('patients')
        .insert({
          org_id: profile.org_id,
          created_by: userResp.user.id,
          full_name: fullName.trim(),
          mrn: mrn.trim() || null,
          dob: dob || null,
          sex,
          notes: notes.trim() || null,
        })

      if (insertError) throw insertError

      resetForm()
      setShowAddModal(false)
      fetchPatients()
    } catch (err: any) {
      setError(err.message || 'Failed to create patient')
    } finally {
      setCreating(false)
    }
  }

  const handleDeletePatient = async (patientId: string) => {
    setDeletingPatientId(patientId)
    try {
      // Need to cascade delete predicting/sessions or rely on DB cascades
      const { error: deleteError } = await supabase.from('patients').delete().eq('id', patientId)
      if (deleteError) throw deleteError

      const { data: userResp } = await supabase.auth.getUser()
      if (userResp.user) {
        await supabase.from('audit_logs').insert({
          user_id: userResp.user.id,
          action: 'patient_deleted',
          entity_type: 'patient',
          entity_id: patientId,
        })
      }

      fetchPatients()
    } catch (err: any) {
      setError(`Failed to delete patient: ${err.message}`)
    } finally {
      setDeletingPatientId(null)
    }
  }

  const promptDeletePatient = (e: React.MouseEvent, patientId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDeletingPatientId(patientId)
  }

  const filteredPatients = patients.filter((patient) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      patient.full_name.toLowerCase().includes(q) ||
      (patient.mrn || '').toLowerCase().includes(q) ||
      patient.id.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return <div className="w-full h-full flex flex-col px-8 py-8"><PageSkeleton /></div>
  }

  return (
    <div className="w-full h-full flex flex-col px-8 py-8 overflow-y-auto">
      <div className="w-full max-w-7xl mx-auto space-y-7">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-in">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 ring-1 ring-purple-500/10">
              <UserRound className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Patients</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage your {patients.length} patient{patients.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Patient
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

        {patients.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 fade-in">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, MRN, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10 w-full"
              />
            </div>
          </div>
        )}

        {patients.length === 0 ? (
          <div className="glass-card p-12 text-center fade-in">
            <UserRound className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No patients yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Add your first patient to start linking sessions to clinical profiles.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-primary gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Patient
            </button>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="glass-card p-12 text-center fade-in">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No patients match your search</p>
            <button onClick={() => setSearchQuery('')} className="text-sm text-primary mt-2 hover:text-primary/80">
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPatients.map((patient, i) => (
              <div
                key={patient.id}
                className="glass-card hover:-translate-y-1 transition-all duration-300 slide-up group overflow-hidden flex flex-col"
                style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'backwards' }}
              >
                <Link href={`/patients/${patient.id}`} className="block p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <UserRound className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{patient.full_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          ID: {patient.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Hash className="w-3.5 h-3.5" />
                      <span>{patient.mrn || 'No MRN'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{patient.dob ? new Date(patient.dob).toLocaleDateString() : 'No DOB'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <span className="badge badge-neutral">{patient.sex || 'unknown'}</span>
                    <span>Added {new Date(patient.created_at).toLocaleDateString()}</span>
                  </div>

                  {patient.notes && (
                    <div className="text-xs text-muted-foreground bg-muted rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <FileText className="w-3 h-3" />
                        Notes
                      </div>
                      <p className="line-clamp-3">{patient.notes}</p>
                    </div>
                  )}
                </Link>

                <div className="border-t border-border flex items-center justify-between">
                  <Link
                    href={`/patients/${patient.id}/session/new`}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-primary hover:bg-accent transition-colors flex-1"
                  >
                    <Activity className="w-4 h-4" />
                    Start Session
                  </Link>
                  {isAdmin && (
                    <button
                      onClick={(e) => promptDeletePatient(e, patient.id)}
                      className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                      title="Delete Patient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <div
              ref={addModalRef}
              role="dialog"
              aria-modal="true"
              className="relative glass-card max-w-lg w-full fade-in max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 id="add-patient-title" className="text-xl font-bold text-foreground">Add New Patient</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={createPatient} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Jane Doe"
                    required
                    className="input-field"
                    ref={firstFieldRef}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Medical Record Number (Optional)</label>
                  <input
                    type="text"
                    value={mrn}
                    onChange={(e) => setMrn(e.target.value)}
                    placeholder="e.g., MRN-10293"
                    className="input-field"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Date of Birth (Optional)</label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Sex</label>
                    <select
                      value={sex}
                      onChange={(e) => setSex(e.target.value as any)}
                      className="input-field"
                    >
                      <option value="unknown">Unknown</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="input-field resize-none"
                    placeholder="Allergies, clinical context, or special notes..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddModal(false); resetForm() }} className="btn-ghost">Cancel</button>
                  <button type="submit" disabled={creating} className="btn-primary gap-2">
                    {creating && <Activity className="w-4 h-4 animate-spin" />}
                    {creating ? 'Creating...' : 'Create Patient'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Delete Patient Modal */}
      <ConfirmModal
        isOpen={!!deletingPatientId}
        title="Delete Patient?"
        message="Are you sure you want to delete this patient? All associated sessions and data will be permanently removed. This action cannot be undone."
        confirmText="Delete Patient"
        error={error}
        isProcessing={false} // State is managed internally during await
        onConfirm={() => deletingPatientId && handleDeletePatient(deletingPatientId)}
        onCancel={() => setDeletingPatientId(null)}
      />
    </div>
  )
}

