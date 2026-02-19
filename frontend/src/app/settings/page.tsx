'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
    Settings, User, Lock, Building2, Save, CheckCircle,
    AlertCircle, Eye, EyeOff, Mail, Shield
} from 'lucide-react'
import { PageSkeleton } from '../components/Skeleton'

interface Profile {
    id: string
    full_name: string | null
    role: string
    org_id: string
}

interface Organization {
    id: string
    name: string
    slug: string
    created_at: string
}

export default function SettingsPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [org, setOrg] = useState<Organization | null>(null)
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'organization'>('profile')
    const supabase = createClientComponentClient()

    const fetchData = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            setEmail(user.email || '')

            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (profileData) {
                setProfile(profileData)
                setFullName(profileData.full_name || '')

                const { data: orgData } = await supabase
                    .from('organizations')
                    .select('*')
                    .eq('id', profileData.org_id)
                    .single()

                if (orgData) setOrg(orgData)
            }
        } catch (err) {
            console.error('Error fetching settings:', err)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleSaveProfile = async () => {
        setSaving(true)
        setError(null)
        setSuccess(null)

        try {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ full_name: fullName })
                .eq('id', profile?.id)

            if (updateError) throw updateError
            setSuccess('Profile updated successfully!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match')
            return
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        setChangingPassword(true)
        setError(null)
        setSuccess(null)

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            })
            if (updateError) throw updateError
            setSuccess('Password changed successfully!')
            setNewPassword('')
            setConfirmPassword('')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setChangingPassword(false)
        }
    }

    if (loading) return <div className="page-wrapper"><PageSkeleton /></div>

    const tabs = [
        { key: 'profile' as const, label: 'Profile', icon: User },
        { key: 'security' as const, label: 'Security', icon: Lock },
        { key: 'organization' as const, label: 'Organization', icon: Building2 },
    ]

    return (
        <div className="page-wrapper">
            <div className="page-content space-y-6">
                {/* Header */}
                <div className="fade-in">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2.5 rounded-xl bg-primary/10">
                            <Settings className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
                            <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
                        </div>
                    </div>
                </div>

                {/* Notifications */}
                {success && (
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-4 fade-in flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <p className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p>
                    </div>
                )}
                {error && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 fade-in flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
                    {tabs.map(tab => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.key}
                                onClick={() => { setActiveTab(tab.key); setError(null); setSuccess(null) }}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                {/* Profile Tab */}
                {activeTab === 'profile' && (
                    <div className="bg-card border border-border rounded-xl p-6 space-y-5 slide-up">
                        <h2 className="text-lg font-semibold text-foreground">Profile Information</h2>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="email"
                                    value={email}
                                    disabled
                                    className="input-field pl-10 opacity-60 cursor-not-allowed"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                        </div>

                        <div>
                            <label htmlFor="fullName" className="block text-sm font-medium text-foreground mb-1.5">
                                Full Name
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    id="fullName"
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="input-field pl-10"
                                    placeholder="Your full name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Role
                            </label>
                            <div className="relative">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={profile?.role || 'operator'}
                                    disabled
                                    className="input-field pl-10 opacity-60 cursor-not-allowed capitalize"
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleSaveProfile}
                                disabled={saving}
                                className="btn-primary gap-2"
                            >
                                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                    <div className="bg-card border border-border rounded-xl p-6 space-y-5 slide-up">
                        <h2 className="text-lg font-semibold text-foreground">Change Password</h2>
                        <p className="text-sm text-muted-foreground">Update your password to keep your account secure</p>

                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-foreground mb-1.5">
                                New Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    id="newPassword"
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="input-field pl-10 pr-10"
                                    placeholder="••••••••"
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Must be at least 6 characters</p>
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1.5">
                                Confirm New Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="input-field pl-10"
                                    placeholder="••••••••"
                                    minLength={6}
                                />
                            </div>
                            {newPassword && confirmPassword && newPassword !== confirmPassword && (
                                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                            )}
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleChangePassword}
                                disabled={changingPassword || !newPassword || newPassword !== confirmPassword}
                                className="btn-primary gap-2"
                            >
                                {changingPassword ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
                                {changingPassword ? 'Changing...' : 'Change Password'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Organization Tab */}
                {activeTab === 'organization' && (
                    <div className="bg-card border border-border rounded-xl p-6 space-y-5 slide-up">
                        <h2 className="text-lg font-semibold text-foreground">Organization</h2>
                        <p className="text-sm text-muted-foreground">Your organization details</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Organization Name</label>
                                <input
                                    type="text"
                                    value={org?.name || '—'}
                                    disabled
                                    className="input-field opacity-60 cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Organization ID</label>
                                <input
                                    type="text"
                                    value={org?.id || '—'}
                                    disabled
                                    className="input-field text-xs font-mono opacity-60 cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Slug</label>
                                <input
                                    type="text"
                                    value={org?.slug || '—'}
                                    disabled
                                    className="input-field opacity-60 cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Created</label>
                                <input
                                    type="text"
                                    value={org?.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                                    disabled
                                    className="input-field opacity-60 cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
