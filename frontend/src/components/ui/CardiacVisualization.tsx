import React from 'react';
import { GlassCard } from './GlassCard';
import { Activity } from 'lucide-react';

export function CardiacVisualization() {
    return (
        <GlassCard className="relative w-full h-full min-h-[400px] flex flex-col overflow-hidden items-center justify-center group border border-hud-cyan/30">
            {/* Background Grid & Scanline */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
            <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none">
                <div className="h-full w-full opacity-30 animate-pulse bg-gradient-to-b from-transparent via-hud-cyan/10 to-transparent"></div>
                <div className="w-full h-[2px] bg-hud-cyan shadow-[0_0_10px_rgba(0,240,255,0.8)] scan-animation" style={{ position: 'absolute', top: 0 }}></div>
            </div>

            {/* Main Container */}
            <div className="relative z-10 flex flex-col items-center justify-center p-8">

                {/* Animated Heart SVG */}
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-hud-cyan/20 blur-[40px] rounded-full animate-pulse"></div>
                    <svg
                        className="w-40 h-40 text-transparent drop-shadow-[0_0_15px_rgba(0,240,255,0.6)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="0.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path
                            className="stroke-hud-cyan pulse-scale-animation"
                            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                        />
                    </svg>

                    {/* Inner animated ECG line overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Activity className="w-16 h-16 text-white opacity-80 animate-pulse" />
                    </div>
                </div>

                {/* Data Overlay */}
                <div className="text-center mt-4">
                    <h2 className="text-hud-cyan font-mono tracking-[0.2em] text-sm uppercase mb-4 group-hover:text-white transition-colors">
                        Cardiac Telemetry Model C-7
                    </h2>
                    <div className="flex gap-4 items-center justify-center">
                        <div className="bg-black/50 border border-hud-cyan/20 px-4 py-2 rounded-lg">
                            <span className="text-xs text-hud-cyan/70 font-mono">BPM</span>
                            <div className="text-2xl font-bold text-white flex items-baseline gap-1">72<span className="text-xs text-hud-cyan animate-pulse">●</span></div>
                        </div>
                        <div className="bg-black/50 border border-hud-amber/20 px-4 py-2 rounded-lg">
                            <span className="text-xs text-hud-amber/70 font-mono">HRV</span>
                            <div className="text-2xl font-bold text-white flex items-baseline gap-1">45<span className="text-xs text-hud-amber">ms</span></div>
                        </div>
                    </div>
                </div>

            </div>
        </GlassCard>
    );
}
