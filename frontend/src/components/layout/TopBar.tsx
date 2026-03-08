'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../app/components/ThemeProvider'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  Moon,
  Sun,
  User,
  Bell,
  Settings,
  LayoutDashboard,
  FileText,
  Users,
  Cpu,
  ClipboardList,
  LogOut,
  Activity,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sessions', href: '/sessions', icon: ClipboardList },
  { label: 'Patients', href: '/patients', icon: Users },
  { label: 'Devices', href: '/devices', icon: Cpu },
  { label: 'Reports', href: '/reports', icon: FileText },
]

const isActivePath = (pathname: string, href: string) => {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function TopBar() {
  const { theme, toggleTheme } = useTheme()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [timeLabel, setTimeLabel] = useState('')
  const supabase = createClientComponentClient()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserEmail(data.user.email || null)
    })
  }, [supabase])

  useEffect(() => {
    const format = () =>
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    setTimeLabel(format())
    const interval = setInterval(() => setTimeLabel(format()), 60000)
    return () => clearInterval(interval)
  }, [])

  const accountLabel = useMemo(() => {
    if (!userEmail) return 'Guest'
    return userEmail.split('@')[0]
  }, [userEmail])

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/auth/login')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  if (pathname === '/' || pathname?.startsWith('/auth')) return null

  return (
    <header className="topbar-shell">
      <div className="topbar-row">
        <Link href="/" className="topbar-brand">
          <div className="topbar-brand-mark">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.25">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="topbar-brand-title">AscultiCor</p>
            <p className="topbar-brand-sub">Pulse Intelligence</p>
          </div>
        </Link>

        <div className="topbar-actions">
          <div className="topbar-time-chip">
            <Activity className="w-3.5 h-3.5" />
            {timeLabel || 'Live'}
          </div>

          <button onClick={toggleTheme} className="topbar-action" title="Toggle Theme" aria-label="Toggle Theme">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <Link href="/alerts" className="topbar-action" title="Alerts" aria-label="Alerts">
            <Bell className="w-4 h-4" />
          </Link>

          <Link href="/settings" className="topbar-action" title="Settings" aria-label="Settings">
            <Settings className="w-4 h-4" />
          </Link>

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="topbar-action topbar-action-danger"
            title={signingOut ? 'Signing out...' : 'Change account / Sign out'}
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>

          <div className="topbar-user-chip">
            <div className="topbar-user-avatar">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="topbar-user-copy">
              <span className="topbar-user-label">Signed in</span>
              <span className="topbar-user-name">{accountLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <nav className="topbar-nav" aria-label="Main">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = isActivePath(pathname, item.href)
          return (
            <Link key={item.href} href={item.href} className={`topbar-nav-link ${isActive ? 'is-active' : ''}`}>
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}

