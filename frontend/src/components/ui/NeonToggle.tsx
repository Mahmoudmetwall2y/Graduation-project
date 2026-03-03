'use client';

import React from 'react';

interface NeonToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    disabled?: boolean;
}

export function NeonToggle({
    checked,
    onChange,
    label,
    description,
    disabled = false,
}: NeonToggleProps) {
    return (
        <div className={`flex items-center justify-between gap-4 py-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={() => {
                if (!disabled) {
                    onChange(!checked);
                }
            }}
        >
            <div className="flex flex-col">
                {label && (
                    <span className="text-sm font-medium text-white/90">
                        {label}
                    </span>
                )}
                {description && (
                    <span className="text-xs text-white/40 mt-0.5">
                        {description}
                    </span>
                )}
            </div>
            <div className="relative inline-flex items-center">
                {/* Track */}
                <div
                    className={`w-10 h-5 rounded-full transition-colors duration-300 ease-in-out border ${checked
                            ? 'bg-hud-cyan/20 border-hud-cyan/50 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                            : 'bg-black/40 border-hud-border/50'
                        }`}
                />

                {/* Thumb */}
                <div
                    className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full transition-transform duration-300 ease-in-out transform ${checked
                            ? 'translate-x-5 bg-hud-cyan shadow-[0_0_8px_rgba(0,240,255,0.8)]'
                            : 'translate-x-0 bg-white/40'
                        }`}
                />
            </div>
        </div>
    );
}
