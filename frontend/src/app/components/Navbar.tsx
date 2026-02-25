'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTheme } from './ThemeProvider'
import {
    LayoutDashboard,
    Cpu,
    PlusCircle,
    Shield,
    LogOut,
    Moon,
    Sun,
    Menu,
    X,
    Heart,
    Settings,
    Users,
    ClipboardList,
    ShieldAlert,
    Bell,
    ChevronLeft,
    ChevronRight,
    User,
    Activity
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface NavbarProps {
    showBackLink?: boolean
    backHref?: string
    backLabel?: string
}

export default function Navbar({ showBackLink, backHref = '/', backLabel = '<- Back' }: NavbarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClientComponentClient()
    const { theme, toggleTheme } = useTheme()
    const [mobileOpen, setMobileOpen] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [userName, setUserName] = useState<string | null>(null)
    const [deviceStats, setDeviceStats] = useState<{ total: number; online: number }>({ total: 0, online: 0 })
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

    useEffect(() => {
        const saved = window.localStorage.getItem('sidebar-collapsed')
        setIsCollapsed(saved === '1')
    }, [])

    useEffect(() => {
        window.localStorage.setItem('sidebar-collapsed', isCollapsed ? '1' : '0')
    }, [isCollapsed])

    useEffect(() => {
        const loadUser = async () => {
            const { data, error } = await supabase.auth.getUser()
            if (error || !data.user) return
            setUserEmail(data.user.email || null)
            const name = (data.user.user_metadata as { full_name?: string } | null)?.full_name
            setUserName(name || null)
        }
        loadUser()
    }, [supabase])

    useEffect(() => {
        let active = true
        const fetchDevices = async () => {
            try {
                const response = await fetch('/api/devices')
                if (!response.ok) return
                const data = await response.json()
                if (!active) return
                const devices = data.devices || []
                const online = devices.filter((d: { status: string }) => d.status === 'online').length
                setDeviceStats({ total: devices.length, online })
                setLastUpdate(new Date())
            } catch {
                // ignore
            }
        }
        fetchDevices()
        const interval = setInterval(fetchDevices, 30000)
        return () => {
            active = false
            clearInterval(interval)
        }
    }, [])

    const userInitials = useMemo(() => {
        const source = userName || userEmail || ''
        const parts = source.split(' ').filter(Boolean)
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        return source.slice(0, 2).toUpperCase()
    }, [userEmail, userName])

    const renderMonitoringWidget = (compact?: boolean) => {
        const hasOnline = deviceStats.online > 0
        const statusText = deviceStats.total === 0
            ? 'No devices registered'
            : `${deviceStats.online}/${deviceStats.total} devices online`
        const updatedText = lastUpdate
            ? `Updated ${lastUpdate.toLocaleTimeString()}`
            : 'Checking status'
        return (
            <div className={`rounded-xl border border-border bg-gradient-to-br from-emerald-50/60 via-transparent to-transparent dark:from-emerald-950/30 p-3 ${compact ? '' : ''}`}>
                <div className="flex items-center gap-2">
                    <span className={`pulse-dot ${hasOnline ? 'online' : 'offline'}`} />
                    <p className="text-xs font-semibold text-foreground">Now Monitoring</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    {statusText}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-600">
                    <Activity className="w-3 h-3" />
                    {updatedText}
                </div>
            </div>
        )
    }

    // Don't show navbar on login page
    if (pathname?.startsWith('/auth')) return null

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/auth/login')
        router.refresh()
    }

    const navSections = [
        {
            title: 'Core',
            items: [
                { href: '/', label: 'Dashboard', icon: LayoutDashboard },
                { href: '/patients', label: 'Patients', icon: Users },
                { href: '/devices', label: 'Devices', icon: Cpu },
                { href: '/sessions', label: 'Sessions', icon: ClipboardList },
                { href: '/alerts', label: 'Alerts', icon: Bell },
            ],
        },
        {
            title: 'Actions',
            items: [
                { href: '/session/new', label: 'New Session', icon: PlusCircle },
            ],
        },
        {
            title: 'Admin',
            items: [
                { href: '/admin', label: 'Admin', icon: Shield },
                { href: '/admin/audit', label: 'Audit Logs', icon: ShieldAlert },
                { href: '/debug', label: 'Debug', icon: Activity },
                { href: '/settings', label: 'Settings', icon: Settings },
            ],
        },
    ]

    return (
        <>
            {/* Desktop sidebar */}
            <aside className={`hidden lg:flex flex-col border-r border-border/60 bg-card/85 backdrop-blur-xl shadow-[0_12px_50px_-30px_rgba(15,23,42,0.45)] lg:sticky lg:top-0 lg:h-screen ${isCollapsed ? 'w-20' : 'w-64'}`}>
                <div className="px-5 py-5">
                    <Link href="/" className={`flex items-center gap-2.5 group ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-md ring-1 ring-white/20 group-hover:shadow-lg transition-shadow">
                            <svg viewBox="0 0 32 32" className="logo-mark" aria-hidden="true">
                                <path d="M3 16h6l2.2-6.2 3.6 12.4 2.8-7.2 1.8 1.8H29" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card animate-pulse" />
                        </div>
                        {!isCollapsed && (
                            <span className="text-xl font-bold tracking-tight text-foreground">
                                Asculti<span className="gradient-text">Cor</span>
                            </span>
                        )}
                    </Link>
                    {/* Demo Mode Indicator */}
                    <div className={`mt-2 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 ${isCollapsed ? 'mx-auto w-fit' : ''}`} title="Demo Mode - Using simulated ML predictions">
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                            {isCollapsed ? 'DEMO' : 'Demo Mode'}
                        </span>
                    </div>
                </div>

                <nav className="px-3 space-y-4">
                    {navSections.map((section) => (
                        <div key={section.title}>
                            {!isCollapsed && (
                                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                                    {section.title}
                                </p>
                            )}
                            <div className="space-y-1">
                                {section.items.map((link) => {
                                    const isActive = pathname === link.href
                                    const Icon = link.icon
                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            title={isCollapsed ? link.label : undefined}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:shadow-[0_0_20px_-12px_rgba(13,148,136,0.7)] ${isActive
                                                ? 'bg-primary/10 text-primary dark:text-primary'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                                } ${isCollapsed ? 'justify-center' : ''}`}
                                        >
                                            {isActive && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1" />
                                            )}
                                            <Icon className="w-4 h-4" />
                                            {!isCollapsed && link.label}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {!isCollapsed && (
                    <div className="px-4 mt-5">
                        <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                            Quick Actions
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                            <Link href="/session/new" className="btn-primary justify-center">
                                <PlusCircle className="w-4 h-4" />
                                New Session
                            </Link>
                            <Link href="/devices" className="btn-secondary justify-center">
                                <Cpu className="w-4 h-4" />
                                Add Device
                            </Link>
                        </div>
                    </div>
                )}

                {!isCollapsed && (
                    <div className="px-4 mt-4">
                        {renderMonitoringWidget()}
                    </div>
                )}

                <div className="mt-3 px-3">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 ${isCollapsed ? 'justify-center' : ''}`}
                        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        {!isCollapsed && 'Collapse'}
                    </button>
                </div>

                <div className="mt-auto p-4 space-y-2">
                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent/40 ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                            {userInitials || <User className="w-4 h-4" />}
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{userName || 'Signed In'}</p>
                                <p className="text-xs text-muted-foreground truncate">{userEmail || 'Connected'}</p>
                                <div className="flex items-center gap-1 text-[11px] text-emerald-600 mt-1">
                                    <Activity className="w-3 h-3" />
                                    Online
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={toggleTheme}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 ${isCollapsed ? 'justify-center' : ''}`}
                        aria-label="Toggle theme"
                        title={isCollapsed ? 'Theme' : undefined}
                    >
                        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        {!isCollapsed && 'Theme'}
                    </button>
                    <button
                        onClick={handleSignOut}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-200 ${isCollapsed ? 'justify-center' : ''}`}
                        title={isCollapsed ? 'Sign Out' : undefined}
                    >
                        <LogOut className="w-4 h-4" />
                        {!isCollapsed && 'Sign Out'}
                    </button>
                </div>
            </aside>

            {/* Mobile top bar */}
            <div className="lg:hidden sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur-xl shadow-[0_12px_40px_-26px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between h-16 px-4">
                    <Link href="/" className="flex items-center gap-2.5">
                        <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 shadow-md ring-1 ring-white/20">
                            <Heart className="w-5 h-5 text-white" strokeWidth={2.5} />
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card animate-pulse" />
                        </div>
                        <span className="text-lg font-bold tracking-tight text-foreground">
                            Asculti<span className="gradient-text">Cor</span>
                        </span>
                    </Link>
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
                    <div className="absolute inset-y-0 left-0 w-72 bg-card border-r border-border shadow-2xl p-4">
                        <nav className="space-y-4">
                            {navSections.map((section) => (
                                <div key={section.title}>
                                    <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                                        {section.title}
                                    </p>
                                    <div className="space-y-1">
                                        {section.items.map((link) => {
                                            const isActive = pathname === link.href
                                            const Icon = link.icon
                                            return (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                onClick={() => setMobileOpen(false)}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:shadow-[0_0_18px_-12px_rgba(13,148,136,0.7)] ${isActive
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                                    }`}
                                            >
                                                {isActive && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                )}
                                                <Icon className="w-5 h-5" />
                                                {link.label}
                                            </Link>
                                        )
                                    })}
                                    </div>
                                </div>
                            ))}
                        </nav>
                        <div className="mt-5">
                            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                                Quick Actions
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                                <Link href="/session/new" onClick={() => setMobileOpen(false)} className="btn-primary justify-center">
                                    <PlusCircle className="w-4 h-4" />
                                    New Session
                                </Link>
                                <Link href="/devices" onClick={() => setMobileOpen(false)} className="btn-secondary justify-center">
                                    <Cpu className="w-4 h-4" />
                                    Add Device
                                </Link>
                            </div>
                        </div>
                        <div className="mt-6">
                            {renderMonitoringWidget(true)}
                        </div>
                        <div className="mt-6 space-y-2">
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent/40">
                                <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                                    {userInitials || <User className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{userName || 'Signed In'}</p>
                                    <p className="text-xs text-muted-foreground truncate">{userEmail || 'Connected'}</p>
                                </div>
                            </div>
                            <button
                                onClick={toggleTheme}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                                Theme
                            </button>
                            <button
                                onClick={handleSignOut}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBackLink && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                    <Link href={backHref!} className="text-primary hover:text-primary/80 text-sm font-medium transition-colors">
                        {backLabel}
                    </Link>
                </div>
            )}
        </>
    )
}
