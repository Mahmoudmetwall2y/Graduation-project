'use client';
import React, { useEffect, useState } from 'react';
import { useTheme } from '../../app/components/ThemeProvider';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Moon, Sun, User, Bell, Search, Settings, LayoutDashboard, FileText, Users, Cpu, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Sessions', href: '/sessions', icon: ClipboardList },
    { label: 'Patients', href: '/patients', icon: Users },
    { label: 'Devices', href: '/devices', icon: Cpu },
    { label: 'Reports', href: '/reports', icon: FileText },
];

export function TopBar() {
    const { theme, toggleTheme } = useTheme();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const supabase = createClientComponentClient();
    const pathname = usePathname();

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) setUserEmail(data.user.email || null);
        });
    }, [supabase]);

    return (
        <header className="flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center px-6 py-3 border-b border-hud-border/30 bg-[#060a14]/90 backdrop-blur-xl z-50">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-hud-cyan/30 to-hud-violet/30 flex items-center justify-center border border-hud-cyan/40 shadow-[0_0_15px_rgba(0,240,255,0.2)] group-hover:shadow-[0_0_25px_rgba(0,240,255,0.4)] transition-shadow">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-hud-cyan" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                </div>
                <div>
                    <span className="text-base font-bold tracking-wide">
                        <span className="text-white">Asculti</span>
                        <span className="text-hud-cyan">Cor</span>
                    </span>
                </div>
            </Link>

            {/* Pill Navigation */}
            <nav className="flex items-center bg-[#0a0e17]/80 backdrop-blur-md border border-hud-cyan/15 rounded-full p-1 shadow-[0_0_20px_rgba(0,240,255,0.05)]">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${isActive
                                ? 'bg-hud-cyan/15 text-hud-cyan border border-hud-cyan/30 shadow-[0_0_12px_rgba(0,240,255,0.15)]'
                                : 'text-white/50 hover:text-white/80 border border-transparent hover:bg-white/5'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Right section: actions + user */}
            <div className="flex items-center gap-3 justify-end">
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-hud-cyan hover:bg-hud-cyan/10 transition-all" title="Search">
                    <Search className="w-4 h-4" />
                </button>
                <button onClick={toggleTheme} className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-hud-cyan hover:bg-hud-cyan/10 transition-all" title="Toggle Theme">
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <Link href="/alerts" className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-hud-cyan hover:bg-hud-cyan/10 transition-all" title="Alerts">
                    <Bell className="w-4 h-4" />
                </Link>
                <Link href="/settings" className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-hud-cyan hover:bg-hud-cyan/10 transition-all" title="Settings">
                    <Settings className="w-4 h-4" />
                </Link>

                <div className="w-px h-6 bg-hud-border/50 mx-1"></div>

                {/* User */}
                <div className="flex items-center gap-2.5 bg-[#0a0e17]/60 border border-hud-border/30 rounded-full pl-3 pr-1.5 py-1">
                    <div className="text-right">
                        <p className="text-[11px] text-white/50 leading-none">Welcome</p>
                        <p className="text-xs text-white/90 font-medium leading-tight mt-0.5">{userEmail ? userEmail.split('@')[0] : 'Dr. Guest'}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-hud-cyan/30 to-hud-violet/20 flex items-center justify-center border border-hud-cyan/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                        <User className="w-4 h-4 text-hud-cyan" />
                    </div>
                </div>
            </div>
        </header>
    );
}
