'use client';
import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Heart, Droplets, Thermometer, Wind } from 'lucide-react';

interface VitalSignsPanelProps {
    heartRate?: number | null;
    bloodPressureSys?: number | null;
    bloodPressureDia?: number | null;
    temperature?: number | null;
    respiration?: number | null;
    lastUpdated?: string;
}

export function VitalSignsPanel({
    heartRate = null,
    bloodPressureSys = null,
    bloodPressureDia = null,
    temperature = null,
    respiration = null,
    lastUpdated = 'Updated 2h ago',
}: VitalSignsPanelProps) {
    return (
        <GlassCard className="p-4 w-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-white uppercase tracking-widest">Vital Signs</h3>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] text-white/40">{lastUpdated}</span>
                </div>
            </div>

            <div className="space-y-3">
                {/* Heart Rate */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <Heart className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">Heart Rate</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-white">{heartRate ?? '—'}</span>
                            <span className="text-[10px] text-white/40">bpm</span>
                        </div>
                    </div>
                    {/* Mini sparkline */}
                    <svg viewBox="0 0 50 20" className="w-14 h-5">
                        <polyline
                            fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5"
                            points="0,15 8,12 14,8 20,14 25,5 30,12 36,10 42,13 50,9"
                            strokeLinecap="round" strokeLinejoin="round"
                        />
                    </svg>
                </div>

                {/* Blood Pressure */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Droplets className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">Blood Pressure</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-white">{bloodPressureSys ?? '—'}</span>
                            <span className="text-[10px] text-white/40">sys</span>
                        </div>
                    </div>
                    {bloodPressureDia && (
                        <span className="text-xs text-white/40 font-mono">/{bloodPressureDia} dia</span>
                    )}
                </div>

                {/* Temperature */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                        <Thermometer className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">Temperature</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-white">{temperature ?? '—'}</span>
                            <span className="text-[10px] text-white/40">°C</span>
                        </div>
                    </div>
                </div>

                {/* Respiration */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                        <Wind className="w-4 h-4 text-teal-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">Respiration</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-white">{respiration ?? '—'}</span>
                            <span className="text-[10px] text-white/40">rpm</span>
                        </div>
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}
