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
  AlertCircle
} from 'lucide-react'
import { PageSkeleton } from '../components/Skeleton'
import { GlassCard } from '../../components/ui/GlassCard'
import { useToast } from '../components/Toast'

interface Patient {
  id: string
  created_by: string | null
  full_name: string
  mrn: string | null
  dob: string | null
  sex: 'female' | 'male' | 'other' | 'unknown' | null
  notes: string | null
  created_at: string
}

export default function PatientsPage() {
  const supabase = createClientComponentClient()
  const { showToast } = useToast()
  const [patients, setPatients] = useState<Patient[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('operator')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Patient | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null)
  const addModalRef = useRef<HTMLDivElement | null>(null)
  const deleteModalRef = useRef<HTMLDivElement | null>(null)
  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  const [fullName, setFullName] = useState('')
  const [mrn, setMrn] = useState('')
  const [dob, setDob] = useState('')
  const [sex, setSex] = useState<'female' | 'male' | 'other' | 'unknown'>('unknown')
  const [notes, setNotes] = useState('')

  const fetchPatients = useCallback(async () => {
    try {
      const [{ data: userResp, error: userError }, { data, error: fetchError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('patients')
          .select('*')
          .order('created_at', { ascending: false }),
      ])

      if (userError) throw userError
      const user = userResp.user
      if (user) {
        setCurrentUserId(user.id)
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (profile?.role) setCurrentUserRole(profile.role)
      }

      if (fetchError) throw fetchError
      setPatients(data || [])
      setError(null)
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

  useEffect(() => {
    if (!showDeleteConfirm) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDeleteConfirm(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showDeleteConfirm])

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

  const canDeletePatient = (patient: Patient) => {
    return currentUserRole === 'admin' || patient.created_by === currentUserId
  }

  const deletePatient = async (patient: Patient) => {
    setDeletingPatientId(patient.id)
    setError(null)
    try {
      const { data: deleted, error: deleteError } = await supabase
        .from('patients')
        .delete()
        .eq('id', patient.id)
        .select('id')
        .maybeSingle()

      if (deleteError) throw deleteError
      if (!deleted) {
        throw new Error('Delete blocked by database policy. Ensure migration 023_delete_policies_for_sessions_and_patients.sql is applied.')
      }

      setPatients((prev) => prev.filter((p) => p.id !== patient.id))
      setShowDeleteConfirm(null)
      showToast('Patient deleted successfully', 'success')
    } catch (err: any) {
      const message = err.message || 'Failed to delete patient'
      setError(message)
      showToast(message, 'error')
    } finally {
      setDeletingPatientId(null)
    }
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
    return <div className="page-wrapper"><PageSkeleton /></div>
  }

  return (
    <div className="page-wrapper">
      <div className="page-content space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Patients</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your {patients.length} patient{patients.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary gap-2">
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
          <GlassCard className="p-12 text-center fade-in">
            <UserRound className="w-14 h-14 text-hud-cyan/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No patients yet</h3>
            <p className="text-sm text-white/50 mb-6 max-w-sm mx-auto">
              Add your first patient to start linking sessions to clinical profiles.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-primary gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Patient
            </button>
          </GlassCard>
        ) : filteredPatients.length === 0 ? (
          <GlassCard className="p-12 text-center fade-in">
            <Search className="w-10 h-10 text-hud-cyan/30 mx-auto mb-3" />
            <p className="text-sm text-white/50">No patients match your search</p>
            <button onClick={() => setSearchQuery('')} className="text-sm text-hud-cyan mt-2 hover:text-white">
              Clear search
            </button>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPatients.map((patient, i) => (
              <div
                key={patient.id}
                className="slide-up"
                style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'backwards' }}
              >
                <GlassCard glowHover className="overflow-hidden flex flex-col h-full">
                  <div className="p-5 flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-hud-cyan/10 flex items-center justify-center border border-hud-cyan/20">
                          <UserRound className="w-5 h-5 text-hud-cyan" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{patient.full_name}</h3>
                          <p className="text-xs text-white/40 font-mono">
                            ID: {patient.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <Hash className="w-3.5 h-3.5 text-hud-cyan/60" />
                        <span>{patient.mrn || 'No MRN'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <Calendar className="w-3.5 h-3.5 text-hud-cyan/60" />
                        <span>{patient.dob ? new Date(patient.dob).toLocaleDateString() : 'No DOB'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-white/50 mb-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-hud-cyan/10 text-hud-cyan border border-hud-cyan/20">{patient.sex || 'unknown'}</span>
                      <span>Added {new Date(patient.created_at).toLocaleDateString()}</span>
                    </div>

                    {patient.notes && (
                      <div className="text-xs text-white/50 bg-black/30 border border-hud-border/20 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 mb-1 text-hud-cyan/70">
                          <FileText className="w-3 h-3" />
                          Notes
                        </div>
                        <p className="line-clamp-3">{patient.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-hud-border/30">
                    <div className="grid grid-cols-2">
                      <Link
                        href="/session/new"
                        className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-hud-cyan hover:bg-hud-cyan/10 transition-colors border-r border-hud-border/30"
                      >
                        <Activity className="w-4 h-4" />
                        Start Session
                      </Link>
                      <button
                        onClick={() => setShowDeleteConfirm(patient)}
                        disabled={!canDeletePatient(patient)}
                        className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${canDeletePatient(patient)
                          ? 'text-red-400 hover:bg-red-500/10'
                          : 'text-white/30 cursor-not-allowed'
                          }`}
                        title={canDeletePatient(patient) ? 'Delete patient' : 'Only admins or record creators can delete'}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </GlassCard>
              </div>
            ))}
          </div>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)} />
            <div
              ref={deleteModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-patient-title"
              className="relative bg-[#0a0e17]/90 border border-[#ff4d4f]/30 shadow-[0_0_30px_rgba(255,77,79,0.15)] rounded-2xl max-w-sm w-full p-6 fade-in backdrop-blur-xl"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
                </div>
                <h2 id="delete-patient-title" className="text-xl font-bold text-foreground">Delete Patient?</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Delete <strong>{showDeleteConfirm.full_name}</strong>. Existing sessions will remain but become unlinked from this patient.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deletePatient(showDeleteConfirm)}
                  disabled={deletingPatientId === showDeleteConfirm.id}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deletingPatientId === showDeleteConfirm.id ? 'Deleting...' : 'Delete Patient'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <div
              ref={addModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-patient-title"
              className="relative bg-[#0a0e17]/90 border border-[#00f0ff]/30 shadow-[0_0_30px_rgba(0,240,255,0.15)] rounded-2xl max-w-lg w-full p-6 fade-in max-h-[90vh] overflow-y-auto backdrop-blur-xl"
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
    </div>
  )
}
