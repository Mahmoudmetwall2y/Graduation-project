import React from 'react';

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    glowHover?: boolean;
}

export function GlassCard({ children, className = '', glowHover = false }: GlassCardProps) {
    return (
        <div
            className={`hud-glass-panel relative overflow-hidden transition-all duration-300 ${glowHover ? 'hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(0,240,255,0.2)]' : ''
                } ${className}`}
        >
            {/* Subtle inner glow/gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            <div className="relative z-10">{children}</div>
        </div>
    );
}
