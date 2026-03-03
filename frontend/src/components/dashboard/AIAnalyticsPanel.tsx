'use client';
import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { BrainCircuit, ShieldAlert } from 'lucide-react';

interface AIAnalyticsPanelProps {
    confidence?: number;
    anomalyDetected?: boolean;
    anomalyDescription?: string;
    predictionCount?: number;
}

export function AIAnalyticsPanel({
    confidence = 0,
    anomalyDetected = false,
    anomalyDescription = 'No anomalies detected in recent analysis.',
    predictionCount = 0,
}: AIAnalyticsPanelProps) {
    return (
        <GlassCard className="p-4 w-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-white uppercase tracking-widest">AI Analytics</h3>
                <button className="text-white/30 hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" /></svg>
                </button>
            </div>

            {/* Confidence badge */}
            <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider border ${confidence >= 80
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : confidence >= 50
                        ? 'bg-hud-amber/10 text-hud-amber border-hud-amber/30'
                        : 'bg-hud-red/10 text-hud-red border-hud-red/30'
                    }`}>
                    Confidence {confidence}%
                </span>
            </div>

            {/* Anomaly detection */}
            <div className="flex items-start gap-3 bg-black/30 border border-hud-border/20 rounded-lg p-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${anomalyDetected
                    ? 'bg-hud-amber/10 border border-hud-amber/30'
                    : 'bg-hud-cyan/10 border border-hud-cyan/20'
                    }`}>
                    {anomalyDetected
                        ? <ShieldAlert className="w-4 h-4 text-hud-amber" />
                        : <BrainCircuit className="w-4 h-4 text-hud-cyan" />
                    }
                </div>
                <div>
                    <h4 className={`text-xs font-semibold ${anomalyDetected ? 'text-hud-amber' : 'text-white'}`}>
                        {anomalyDetected ? 'Anomaly Detection' : 'Analysis Clear'}
                    </h4>
                    <p className="text-[10px] text-white/50 mt-1 leading-relaxed">
                        {anomalyDescription}
                    </p>
                </div>
            </div>

            {predictionCount > 0 && (
                <p className="text-[9px] text-white/30 font-mono mt-2">
                    Based on {predictionCount} predictions
                </p>
            )}
        </GlassCard>
    );
}
