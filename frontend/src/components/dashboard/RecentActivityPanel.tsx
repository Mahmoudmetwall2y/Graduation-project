'use client';
import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Heart, Activity } from 'lucide-react';

interface RecentItem {
    id: string;
    label: string;
    time: string;
    status: 'done' | 'processing' | 'error' | 'streaming';
    type?: string;
}

interface RecentActivityPanelProps {
    items: RecentItem[];
    lastUpdated?: string;
}

const statusColors: Record<string, string> = {
    done: 'bg-emerald-400',
    processing: 'bg-blue-400 animate-pulse',
    error: 'bg-red-400',
    streaming: 'bg-hud-cyan animate-pulse',
};

const statusLabels: Record<string, string> = {
    done: 'Complete',
    processing: 'Processing',
    error: 'Error',
    streaming: 'Streaming',
};

export function RecentActivityPanel({ items, lastUpdated = 'Updated 2h ago' }: RecentActivityPanelProps) {
    return (
        <GlassCard className="p-4 w-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-white uppercase tracking-widest">Recent Activity</h3>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[9px] text-white/40">{lastUpdated}</span>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="text-center py-4">
                    <Activity className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    <p className="text-[10px] text-white/30">No recent activity</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.slice(0, 4).map((item) => (
                        <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-hud-border/15 last:border-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-hud-cyan/10 border border-hud-cyan/20 flex items-center justify-center">
                                    <Heart className="w-3.5 h-3.5 text-hud-cyan" />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-white/90">{item.label}</p>
                                    <p className="text-[9px] text-white/30 font-mono">{item.time}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${statusColors[item.status] || 'bg-gray-400'}`} />
                                <span className="text-[9px] text-white/40 font-mono uppercase">{statusLabels[item.status] || item.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </GlassCard>
    );
}
