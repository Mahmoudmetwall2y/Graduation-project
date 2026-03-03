'use client';
import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Activity } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface PcgGraphPanelProps {
    data: any[];
    liveLabel?: string;
}

export function PcgGraphPanel({ data, liveLabel = 'Waiting...' }: PcgGraphPanelProps) {
    return (
        <GlassCard className="p-4 w-full">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-rose-400" />
                    <h3 className="text-xs font-semibold text-white uppercase tracking-widest">PCG Waveform</h3>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${liveLabel.includes('Live') ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`} />
                    <span className="text-[9px] text-white/40">{liveLabel}</span>
                </div>
            </div>
            <div className="h-[120px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="time" hide />
                        <YAxis hide domain={[-0.5, 1]} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                fontSize: '10px',
                                color: '#fff',
                            }}
                            formatter={(value: number) => [`${value.toFixed(3)} Amp`, 'Amp']}
                            labelStyle={{ display: 'none' }}
                        />
                        <defs>
                            <linearGradient id="pcgGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#fb7185" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="amplitude"
                            stroke="#fb7185"
                            strokeWidth={1.5}
                            fill="url(#pcgGrad)"
                            dot={false}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </GlassCard>
    );
}
