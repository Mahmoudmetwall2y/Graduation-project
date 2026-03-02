'use client';
import React from 'react';

interface AnnotationCalloutProps {
    label: string;
    description?: string;
    variant?: 'analyzing' | 'warning' | 'critical';
    className?: string;
}

const variantStyles = {
    analyzing: {
        dot: 'bg-hud-cyan shadow-[0_0_8px_rgba(0,240,255,0.8)]',
        text: 'text-hud-cyan',
        line: 'bg-hud-cyan/40',
        border: 'border-hud-cyan/30',
    },
    warning: {
        dot: 'bg-hud-amber shadow-[0_0_8px_rgba(255,184,0,0.8)]',
        text: 'text-hud-amber',
        line: 'bg-hud-amber/40',
        border: 'border-hud-amber/30',
    },
    critical: {
        dot: 'bg-hud-red shadow-[0_0_8px_rgba(255,51,51,0.8)]',
        text: 'text-hud-red',
        line: 'bg-hud-red/40',
        border: 'border-hud-red/30',
    },
};

export function AnnotationCallout({ label, description, variant = 'analyzing', className = '' }: AnnotationCalloutProps) {
    const style = variantStyles[variant];

    return (
        <div className={`flex items-start gap-2 ${className}`}>
            <div className="flex flex-col items-center gap-1 mt-1">
                <div className={`w-2 h-2 rounded-full animate-pulse ${style.dot}`} />
                <div className={`w-px h-6 ${style.line}`} />
            </div>
            <div className={`bg-black/60 backdrop-blur-md border ${style.border} rounded-lg px-3 py-2 max-w-[200px]`}>
                <p className={`text-[10px] font-mono uppercase tracking-[0.2em] ${style.text} animate-pulse`}>
                    {label}
                </p>
                {description && (
                    <p className="text-[10px] text-white/60 mt-1 leading-relaxed">{description}</p>
                )}
            </div>
        </div>
    );
}
