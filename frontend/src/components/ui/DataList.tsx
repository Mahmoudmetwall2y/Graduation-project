import React from 'react';
import { GlassCard } from './GlassCard';
import Link from 'next/link';

interface DataListProps {
    title: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    headers: string[];
    children: React.ReactNode;
}

export function DataList({ title, icon, action, headers, children }: DataListProps) {
    return (
        <GlassCard className="flex flex-col overflow-hidden w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-hud-border/30 gap-4">
                <div className="flex items-center gap-3">
                    {icon && <div className="p-2 bg-hud-cyan/10 rounded-lg text-hud-cyan border border-hud-cyan/20 shadow-[0_0_10px_rgba(0,240,255,0.15)]">{icon}</div>}
                    <h2 className="text-lg font-medium text-white tracking-widest uppercase">{title}</h2>
                </div>
                {action && <div>{action}</div>}
            </div>

            <div className="w-full overflow-x-auto">
                <div className="w-full table border-collapse min-w-[600px]">
                    <div className="table-header-group">
                        <div className="table-row border-b border-hud-border/30 bg-black/40">
                            {headers.map((header, i) => (
                                <div key={header} className={`table-cell px-6 py-4 text-xs font-semibold text-hud-cyan/70 uppercase tracking-widest ${i === headers.length - 1 ? 'text-right' : 'text-left'}`}>
                                    {header}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="table-row-group bg-[#0a0e17]/40">
                        {children}
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}

export function DataListRow({ children, className = '', href }: { children: React.ReactNode, className?: string, href?: string }) {
    const classes = `table-row hover:bg-hud-cyan/5 hover:shadow-[inset_0_0_15px_rgba(0,240,255,0.05)] transition-all duration-300 group border-b border-hud-border/20 last:border-0 ${className}`;

    if (href) {
        // Next.js Link can be passHref or rendered natively, here we just use it safely
        return (
            <Link href={href} className={classes} style={{ display: 'table-row' }}>
                {children}
            </Link>
        );
    }
    return (
        <div className={classes}>
            {children}
        </div>
    );
}

export function DataListCell({ children, className = '', isLast = false }: { children: React.ReactNode, className?: string, isLast?: boolean }) {
    return (
        <div className={`table-cell align-middle px-6 py-4 whitespace-nowrap text-sm text-white/80 ${isLast ? 'text-right font-medium' : ''} ${className}`}>
            {children}
        </div>
    );
}
