import React from 'react';
import { GlassCard } from './GlassCard';
import { StatusBadge, StatusType } from './StatusBadge';

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    status?: StatusType;
    statusLabel?: string;
    icon?: React.ReactNode;
    children?: React.ReactNode;
}

export function MetricCard({ title, value, subtitle, status, statusLabel, icon, children }: MetricCardProps) {
    return (
        <GlassCard glowHover className="p-5 flex flex-col justify-between h-full">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-medium text-hud-cyan/80 uppercase tracking-wider title-text">{title}</h3>
                {icon && <div className="text-hud-cyan opacity-80">{icon}</div>}
            </div>

            <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
            </div>

            {children && <div className="mt-2 mb-3">{children}</div>}

            <div className="flex justify-between flex-wrap gap-2 items-center mt-auto pt-2 border-t border-hud-border/50">
                {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
                {status && statusLabel && (
                    <StatusBadge status={status} label={statusLabel} pulse={status === 'ok' || status === 'critical'} />
                )}
            </div>
        </GlassCard>
    );
}
