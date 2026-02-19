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
    Settings
} from 'lucide-react'
import { useState } from 'react'

interface NavbarProps {
    showBackLink?: boolean
    backHref?: string
    backLabel?: string
}

export default function Navbar({ showBackLink, backHref = '/', backLabel = '← Back' }: NavbarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClientComponentClient()
    const { theme, toggleTheme } = useTheme()
    const [mobileOpen, setMobileOpen] = useState(false)

    // Don't show navbar on login page
    if (pathname?.startsWith('/auth')) return null

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/auth/login')
        router.refresh()
    }

    const navLinks = [
        { href: '/', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/devices', label: 'Devices', icon: Cpu },
        { href: '/session/new', label: 'New Session', icon: PlusCircle },
        { href: '/admin', label: 'Admin', icon: Shield },
        { href: '/settings', label: 'Settings', icon: Settings },
    ]

    return (
        <>
            <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        {/* Logo + Nav Links */}
                        <div className="flex items-center gap-8">
                            <Link href="/" className="flex items-center gap-2.5 group">
                                <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 shadow-md group-hover:shadow-lg transition-shadow">
                                    <Heart className="w-5 h-5 text-white" strokeWidth={2.5} />
                                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card animate-pulse" />
                                </div>
                                <span className="text-xl font-bold tracking-tight text-foreground">
                                    SONO<span className="gradient-text">CARDIA</span>
                                </span>
                            </Link>

                            {/* Desktop Nav */}
                            <div className="hidden md:flex items-center gap-1">
                                {navLinks.map((link) => {
                                    const isActive = pathname === link.href
                                    const Icon = link.icon
                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                                ? 'bg-primary/10 text-primary dark:text-primary'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                                }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {link.label}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleTheme}
                                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
                                aria-label="Toggle theme"
                            >
                                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            </button>

                            <button
                                onClick={handleSignOut}
                                className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-200"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign Out
                            </button>

                            {/* Mobile menu button */}
                            <button
                                onClick={() => setMobileOpen(!mobileOpen)}
                                className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile menu */}
                {mobileOpen && (
                    <div className="md:hidden border-t border-border bg-card fade-in">
                        <div className="px-4 py-3 space-y-1">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href
                                const Icon = link.icon
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {link.label}
                                    </Link>
                                )
                            })}
                            <button
                                onClick={handleSignOut}
                                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                )}
            </nav>

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
