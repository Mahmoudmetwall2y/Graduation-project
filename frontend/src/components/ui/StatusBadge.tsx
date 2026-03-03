import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, WifiOff } from 'lucide-react';

export type StatusType = 'ok' | 'warning' | 'critical' | 'offline';

interface StatusBadgeProps {
    status: StatusType;
    label: string;
    pulse?: boolean;
    className?: string;
}

const statusConfig = {
    ok: {
        baseClass: 'bg-hud-cyan/10 text-hud-cyan border-hud-cyan/30',
        icon: <CheckCircle2 className="w-4 h-4" />,
        pulseClass: 'bg-hud-cyan',
    },
    warning: {
        baseClass: 'bg-hud-amber/10 text-hud-amber border-hud-amber/30',
        icon: <AlertTriangle className="w-4 h-4" />,
        pulseClass: 'bg-hud-amber',
    },
    critical: {
        baseClass: 'bg-hud-red/10 text-hud-red border-hud-red/30',
        icon: <AlertCircle className="w-4 h-4" />,
        pulseClass: 'bg-hud-red',
    },
    offline: {
        baseClass: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
        icon: <WifiOff className="w-4 h-4" />,
        pulseClass: 'bg-gray-400',
    },
};

export function StatusBadge({ status, label, pulse = false, className = '' }: StatusBadgeProps) {
    const config = statusConfig[status];

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-full ${config.baseClass} ${className}`}
        >
            {pulse && (
                <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.pulseClass}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${config.pulseClass}`}></span>
                </span>
            )}
            {!pulse && config.icon}
            {label}
        </span>
    );
}
