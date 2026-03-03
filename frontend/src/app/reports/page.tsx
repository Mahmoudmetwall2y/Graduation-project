'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
    FileText, Download, Activity, Heart,
    AlertTriangle, Calendar, Search, Filter,
    CheckCircle, BarChart3, Users
} from 'lucide-react'
import { PageSkeleton } from '../components/Skeleton'
import { GlassCard } from '../../components/ui/GlassCard'
import { useToast } from '../components/Toast'

// Libraries for PDF generation
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

interface AggregateStats {
    totalSessions: number
    anomaliesDetected: number
    totalPatients: number
    totalRecordings: number
}

interface ReportSession {
    id: string
    created_at: string
    patient_id: string | null
    status: string
    patient?: { full_name: string, mrn: string | null } | null
    predictions?: {
        output_json: {
            confidence: number
            label: string
        }
    }[] | null
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function toSafeFilename(value: string): string {
    const normalized = value
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .trim()
    return normalized || 'Unknown_Patient'
}

export default function ReportsPage() {
    const supabase = createClientComponentClient()
    const { showToast } = useToast()

    const [loading, setLoading] = useState(true)
    const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null)
    const [stats, setStats] = useState<AggregateStats>({
        totalSessions: 0,
        anomaliesDetected: 0,
        totalPatients: 0,
        totalRecordings: 0
    })
    const [sessions, setSessions] = useState<ReportSession[]>([])
    const [searchQuery, setSearchQuery] = useState('')

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)

            // 1. Fetch aggregate stats
            const [sessionsCount, patientsCount, recordingsCount, predictionsRes] = await Promise.all([
                supabase.from('sessions').select('*', { count: 'exact', head: true }),
                supabase.from('patients').select('*', { count: 'exact', head: true }),
                supabase.from('recordings').select('*', { count: 'exact', head: true }),
                supabase.from('predictions').select('output_json')
            ])

            let anomalyCount = 0
            if (predictionsRes.data) {
                anomalyCount = predictionsRes.data.filter(p =>
                    p.output_json?.label !== 'Normal' &&
                    p.output_json?.label !== 'uninterpretable'
                ).length
            }

            setStats({
                totalSessions: sessionsCount.count || 0,
                totalPatients: patientsCount.count || 0,
                totalRecordings: recordingsCount.count || 0,
                anomaliesDetected: anomalyCount
            })

            // 2. Fetch sessions for the report list
            const { data: sessionData, error: sessionError } = await supabase
                .from('sessions')
                .select(`
          id,
          created_at,
          status,
          patient_id,
          patient:patients(full_name, mrn),
          predictions(output_json)
        `)
                .order('created_at', { ascending: false })
                .limit(50) // Limit to recent 50 for performance

            if (sessionError) throw sessionError

            const formattedSessions = (sessionData || []).map((row: any) => ({
                ...row,
                patient: Array.isArray(row.patient) ? row.patient[0] : row.patient,
            }))

            setSessions(formattedSessions)

        } catch (error) {
            console.error('Error fetching reports data:', error)
            showToast('Failed to load report data', 'error')
        } finally {
            setLoading(false)
        }
    }, [supabase, showToast])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const generateSessionPDF = async (session: ReportSession) => {
        setGeneratingPdfId(session.id)
        showToast('Generating Clinical Report...', 'info')

        try {
            // For the functional demo, we dynamically create a hidden HTML element
            // containing the clinical report data, render it to canvas, and save as PDF.
            const reportContainer = document.createElement('div')
            reportContainer.className = 'absolute top-[-9999px] left-[-9999px] bg-white text-black p-10 w-[800px]'

            const patientName = session.patient?.full_name || 'Unknown Patient'
            const patientMrn = session.patient?.mrn || 'N/A'
            const dateStr = new Date(session.created_at).toLocaleString()

            let aiFinding = 'No AI analysis available'
            if (session.predictions && session.predictions.length > 0) {
                const pred = session.predictions[0].output_json
                aiFinding = `${pred.label} (Confidence: ${(pred.confidence * 100).toFixed(1)}%)`
            }

            const safePatientName = escapeHtml(patientName)
            const safePatientMrn = escapeHtml(patientMrn)
            const safeDateStr = escapeHtml(dateStr)
            const safeStatus = escapeHtml(session.status)
            const safeAiFinding = escapeHtml(aiFinding)

            reportContainer.innerHTML = `
                <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto;">
                    <div style="border-bottom: 2px solid #00f0ff; padding-bottom: 20px; mb-6">
                        <h1 style="color: #1a1a1a; margin: 0; font-size: 28px;">AscultiCor Clinical Report</h1>
                        <p style="color: #666; margin: 5px 0 0 0;">Cardiovascular Auscultation Analysis</p>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 30px; margin-bottom: 30px;">
                        <div>
                            <h3 style="color: #666; font-size: 14px; text-transform: uppercase;">Patient Information</h3>
                            <p style="margin: 5px 0;"><strong>Name:</strong> ${safePatientName}</p>
                            <p style="margin: 5px 0;"><strong>MRN:</strong> ${safePatientMrn}</p>
                        </div>
                        <div style="text-align: right;">
                            <h3 style="color: #666; font-size: 14px; text-transform: uppercase;">Session Details</h3>
                            <p style="margin: 5px 0;"><strong>Session ID:</strong> ${escapeHtml(session.id.substring(0, 8))}...</p>
                            <p style="margin: 5px 0;"><strong>Date:</strong> ${safeDateStr}</p>
                            <p style="margin: 5px 0;"><strong>Status:</strong> ${safeStatus}</p>
                        </div>
                    </div>

                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                        <h3 style="color: #0f172a; margin-top: 0;">AI Diagnostic Finding</h3>
                        <p style="font-size: 18px; color: ${aiFinding.includes('Normal') ? '#10b981' : '#ef4444'}; font-weight: bold; margin: 10px 0;">
                            ${safeAiFinding}
                        </p>
                    </div>

                    <div style="margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                            Generated by AscultiCor AI Engine • For Investigational Use Only • Not a finalized medical diagnosis.
                        </p>
                    </div>
                </div>
            `
            document.body.appendChild(reportContainer)

            const canvas = await html2canvas(reportContainer, { scale: 2 })
            const imgData = canvas.toDataURL('image/png')

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [canvas.width, canvas.height]
            })

            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
            const safeFilePatientName = toSafeFilename(patientName)
            pdf.save(`AscultiCor_Report_${safeFilePatientName}_${session.id.substring(0, 6)}.pdf`)

            document.body.removeChild(reportContainer)
            showToast('Report generated successfully', 'success')

        } catch (err) {
            console.error('PDF Generation Error:', err)
            showToast('Failed to generate report', 'error')
        } finally {
            setGeneratingPdfId(null)
        }
    }

    const filteredSessions = sessions.filter(s => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return (
            s.patient?.full_name?.toLowerCase().includes(q) ||
            s.patient?.mrn?.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q)
        )
    })

    if (loading) return <div className="page-wrapper"><PageSkeleton /></div>

    return (
        <div className="relative page-wrapper h-full overflow-y-auto" style={{ backgroundColor: 'var(--hud-bg-base)' }}>
            {/* Cosmic background effects */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute top-1/4 left-1/4 w-[800px] h-[800px] bg-hud-cyan/5 rounded-full blur-[150px]" />
                <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-hud-violet/5 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 page-content space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 fade-in">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2.5 rounded-xl bg-hud-cyan/10 border border-hud-cyan/30 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                            <FileText className="w-6 h-6 text-hud-cyan" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Reports Hub</h1>
                            <p className="text-sm text-white/50">Clinical Data Export & Aggregate Analytics</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button className="btn-secondary gap-2 border-hud-cyan/30 hover:border-hud-cyan/60 hover:text-hud-cyan transition-colors">
                            <Download className="w-4 h-4" /> Export Bulk CSR
                        </button>
                    </div>
                </div>

                {/* Aggregate Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 fade-in slide-up">
                    <GlassCard className="p-5 flex items-center justify-between group">
                        <div>
                            <p className="text-sm font-medium text-white/60 mb-1">Total Sessions</p>
                            <h3 className="text-2xl font-bold text-white group-hover:text-hud-cyan transition-colors">
                                {stats.totalSessions}
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-hud-cyan/10 flex items-center justify-center border border-hud-cyan/20">
                            <Activity className="w-5 h-5 text-hud-cyan" />
                        </div>
                    </GlassCard>

                    <GlassCard className="p-5 flex items-center justify-between group">
                        <div>
                            <p className="text-sm font-medium text-white/60 mb-1">Anomalies Detected</p>
                            <h3 className="text-2xl font-bold text-white group-hover:text-hud-red transition-colors">
                                {stats.anomaliesDetected}
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-hud-red/10 flex items-center justify-center border border-hud-red/20">
                            <AlertTriangle className="w-5 h-5 text-hud-red" />
                        </div>
                    </GlassCard>

                    <GlassCard className="p-5 flex items-center justify-between group">
                        <div>
                            <p className="text-sm font-medium text-white/60 mb-1">Enrolled Patients</p>
                            <h3 className="text-2xl font-bold text-white group-hover:text-hud-violet transition-colors">
                                {stats.totalPatients}
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-hud-violet/10 flex items-center justify-center border border-hud-violet/20">
                            <Users className="w-5 h-5 text-hud-violet" />
                        </div>
                    </GlassCard>

                    <GlassCard className="p-5 flex items-center justify-between group">
                        <div>
                            <p className="text-sm font-medium text-white/60 mb-1">Raw Recordings</p>
                            <h3 className="text-2xl font-bold text-white">
                                {stats.totalRecordings}
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                            <BarChart3 className="w-5 h-5 text-white/60" />
                        </div>
                    </GlassCard>
                </div>

                {/* Session Reports Table */}
                <GlassCard className="overflow-hidden slide-up flex-1 flex flex-col min-h-[500px]">
                    <div className="p-4 border-b border-hud-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black/20">
                        <h2 className="text-lg font-semibold text-white">Clinical Session Reports</h2>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <input
                                type="text"
                                placeholder="Search patient or ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="input-field pl-10 w-full hud-input bg-black/40"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-white/50 uppercase bg-black/30 sticky top-0 backdrop-blur-md z-10 border-b border-hud-border/40">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Session Date</th>
                                    <th className="px-6 py-4 font-medium">Patient</th>
                                    <th className="px-6 py-4 font-medium">AI Finding</th>
                                    <th className="px-6 py-4 font-medium text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hud-border/20">
                                {filteredSessions.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-white/40">
                                            No session reports found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSessions.map((session) => {
                                        let aiLabel = 'Pending / None'
                                        let aiColor = 'text-white/40'

                                        if (session.predictions && session.predictions.length > 0) {
                                            const p = session.predictions[0].output_json
                                            aiLabel = p.label

                                            // Color coding
                                            if (aiLabel.includes('Normal')) aiColor = 'text-emerald-400'
                                            else if (aiLabel !== 'uninterpretable') aiColor = 'text-hud-red'
                                            else aiColor = 'text-amber-400'

                                            aiLabel = `${aiLabel} (${(p.confidence * 100).toFixed(0)}%)`
                                        }

                                        const isGenerating = generatingPdfId === session.id

                                        return (
                                            <tr key={session.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4 whitespace-nowrap text-white/80">
                                                    {new Date(session.created_at).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-white">{session.patient?.full_name || 'Anonymous'}</div>
                                                    <div className="text-xs text-white/40">MRN: {session.patient?.mrn || 'N/A'}</div>
                                                </td>
                                                <td className={`px-6 py-4 font-medium ${aiColor}`}>
                                                    {aiLabel}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => generateSessionPDF(session)}
                                                        disabled={isGenerating}
                                                        className="px-3 py-1.5 rounded-md bg-hud-cyan/10 text-hud-cyan text-xs font-medium border border-hud-cyan/30 hover:bg-hud-cyan hover:text-black transition-all flex items-center gap-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isGenerating ? (
                                                            <>
                                                                <span className="w-3 h-3 border-2 border-hud-cyan/30 border-t-hud-cyan rounded-full animate-spin" />
                                                                Building...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Download className="w-3 h-3" />
                                                                PDF
                                                            </>
                                                        )}
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>

            </div>
        </div>
    )
}
