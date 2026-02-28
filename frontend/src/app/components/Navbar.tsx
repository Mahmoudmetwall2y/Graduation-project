'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    Cpu,
    ClipboardList,
    Bell,
    Power,
    HeartPulse,
    MessageSquare,
    FileText,
    User,
    Grid,
    Menu,
    X,
} from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function Navbar() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClientComponentClient()
    const [mobileOpen, setMobileOpen] = useState(false)

    // Close mobile menu on route change
    useEffect(() => {
        setMobileOpen(false)
    }, [pathname])

    // Don't show navbar on login page
    if (pathname?.startsWith('/auth')) return null

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/auth/login')
        router.refresh()
    }

    // Mapping icons to reference design:
    // M+ at top. Then Heart, Message, Document, Profile ... Grid ... Power.
    const navLinks = [
        { href: '/', icon: Grid, label: 'Dashboard' },
        { href: '/patients', icon: HeartPulse, label: 'Patients' },
        { href: '/alerts', icon: MessageSquare, label: 'Alerts' },
        { href: '/sessions', icon: FileText, label: 'Sessions' },
        { href: '/settings', icon: User, label: 'Profile' },
    ]

    const NavIcon = ({ link, isMobile = false }: { link: { href: string; icon: React.ComponentType<any>; label: string }; isMobile?: boolean }) => {
        const isActive = pathname === link.href
        const Icon = link.icon

        if (isMobile) {
            return (
                <Link
                    href={link.href}
                    className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 ${isActive
                        ? 'bg-primary text-white shadow-glow'
                        : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground'
                        }`}
                >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{link.label}</span>
                </Link>
            )
        }

        return (
            <Link
                href={link.href}
                title={link.label}
                className={`relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${isActive
                    ? 'bg-primary text-white shadow-glow'
                    : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground'
                    }`}
            >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
            </Link>
        )
    }

    return (
        <>
            {/* ▸ Desktop sidebar */}
            <aside className="hidden lg:flex flex-col items-center w-28 py-8 h-full bg-transparent flex-shrink-0 z-10">
                {/* Logo */}
                <Link href="/" className="mb-12 font-bold text-2xl tracking-tight text-foreground flex items-center justify-center">
                    M<span className="text-primary align-top text-lg font-black ml-[1px]">+</span>
                </Link>

                {/* Navigation Icons */}
                <nav className="flex flex-col items-center gap-6 mt-4">
                    {navLinks.map((link) => (
                        <NavIcon key={link.href} link={link} />
                    ))}
                </nav>

                {/* Power / Sign out button */}
                <button
                    onClick={handleSignOut}
                    className="mt-auto mb-4 w-12 h-12 flex items-center justify-center rounded-full border border-border bg-white text-muted-foreground hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-sm shadow-black/5"
                    title="Sign Out"
                >
                    <Power className="w-5 h-5" />
                </button>
            </aside>

            {/* ▸ Mobile top bar */}
            <div className="lg:hidden sticky top-0 z-50 bg-card/90 backdrop-blur-xl border-b border-border">
                <div className="flex items-center justify-between h-16 px-6">
                    <Link href="/" className="font-bold text-xl tracking-tight text-foreground flex items-center">
                        M<span className="text-primary text-sm font-black">+</span>
                    </Link>
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors"
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* ▸ Mobile drawer */}
            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-40">
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
                    <div className="absolute inset-y-0 right-0 w-72 bg-card border-l border-border shadow-2xl p-6 flex flex-col slide-in-right">
                        <nav className="flex flex-col gap-2 mt-8">
                            {navLinks.map((link) => (
                                <NavIcon key={link.href} link={link} isMobile />
                            ))}
                        </nav>

                        <button
                            onClick={handleSignOut}
                            className="mt-auto flex items-center gap-4 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 font-medium transition-colors"
                        >
                            <Power className="w-5 h-5" />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
