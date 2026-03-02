'use client';
import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { UserRound } from 'lucide-react';

interface PatientInfoPanelProps {
    patientName?: string;
    patientAge?: string;
    patientSex?: string;
    bloodType?: string;
    height?: string;
    weight?: string;
    bmi?: string;
}

export function PatientInfoPanel({
    patientName = 'Patient',
    patientAge = '—',
    patientSex = '—',
    bloodType = 'O+',
    height = '—',
    weight = '—',
    bmi = '—',
}: PatientInfoPanelProps) {
    return (
        <GlassCard className="p-4 w-full">
            <div className="flex items-center gap-3 mb-3">
                <div className="flex -space-x-2">
                    <div className="w-10 h-10 rounded-full bg-hud-cyan/20 border-2 border-[#0a0e17] flex items-center justify-center">
                        <UserRound className="w-5 h-5 text-hud-cyan" />
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{patientName}</h3>
                    <p className="text-[10px] text-white/40 font-mono">{patientSex}, {patientAge}</p>
                </div>
                <button className="text-white/30 hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" /></svg>
                </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {[
                    { label: 'Blood\nType', value: bloodType },
                    { label: 'Height', value: height },
                    { label: 'Weight', value: weight },
                    { label: 'BMI', value: bmi },
                ].map((item) => (
                    <div key={item.label} className="bg-black/40 border border-hud-border/20 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-white/40 uppercase tracking-wider leading-tight whitespace-pre-line">{item.label}</p>
                        <p className="text-sm font-bold text-white mt-0.5">{item.value}</p>
                    </div>
                ))}
            </div>
        </GlassCard>
    );
}
