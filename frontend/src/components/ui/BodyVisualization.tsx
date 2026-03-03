'use client';
import React, { useState } from 'react';
import { AnnotationCallout } from '../dashboard/AnnotationCallout';

const bodyTabs = ['Muscles', 'Skeleton', 'Organs'] as const;

export function BodyVisualization() {
    const [activeTab, setActiveTab] = useState<typeof bodyTabs[number]>('Skeleton');

    return (
        <div className="relative flex flex-col items-center justify-center h-full w-full min-h-[500px]">
            {/* Grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]" />

            {/* Scanline animation */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-hud-cyan/60 to-transparent shadow-[0_0_15px_rgba(0,240,255,0.6)] scan-line-animation" />
            </div>

            {/* Annotation callouts - positioned around the body */}
            <div className="absolute top-[8%] left-[8%] z-20">
                <AnnotationCallout label="Analyzing..." variant="analyzing" />
            </div>
            <div className="absolute top-[15%] right-[5%] z-20">
                <AnnotationCallout
                    label="Cardiac Region"
                    description="Heart rhythm analysis active. Monitoring auscultation signals."
                    variant="analyzing"
                />
            </div>
            <div className="absolute bottom-[30%] left-[5%] z-20">
                <AnnotationCallout label="Analyzing..." variant="analyzing" />
            </div>
            <div className="absolute bottom-[25%] right-[8%] z-20">
                <AnnotationCallout
                    label="Signal Processing"
                    description="PCG signal buffering. Noise reduction pipeline active."
                    variant="warning"
                />
            </div>

            {/* Glow behind body */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[400px] bg-hud-cyan/5 blur-[80px] rounded-full" />
            <div className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] bg-hud-amber/8 blur-[60px] rounded-full" />

            {/* Anatomical Body SVG */}
            <div className="relative z-10 flex items-center justify-center body-pulse-animation">
                <svg
                    viewBox="0 0 200 500"
                    className="h-[420px] w-auto drop-shadow-[0_0_20px_rgba(0,240,255,0.3)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    {/* Head */}
                    <ellipse cx="100" cy="40" rx="22" ry="28" className="stroke-hud-cyan/80" />
                    {/* Eye sockets */}
                    <circle cx="91" cy="35" r="5" className="stroke-hud-cyan/40" />
                    <circle cx="109" cy="35" r="5" className="stroke-hud-cyan/40" />
                    {/* Nose */}
                    <line x1="100" y1="38" x2="100" y2="46" className="stroke-hud-cyan/30" />
                    {/* Jaw */}
                    <path d="M82 48 Q100 60 118 48" className="stroke-hud-cyan/40" />

                    {/* Neck */}
                    <line x1="93" y1="68" x2="93" y2="82" className="stroke-hud-cyan/70" />
                    <line x1="107" y1="68" x2="107" y2="82" className="stroke-hud-cyan/70" />

                    {/* Spine */}
                    <line x1="100" y1="82" x2="100" y2="280" className="stroke-hud-cyan/50" strokeDasharray="4 3" />

                    {/* Ribcage */}
                    <path d="M70 95 Q100 85 130 95" className="stroke-hud-cyan/60" />
                    <path d="M65 110 Q100 98 135 110" className="stroke-hud-cyan/60" />
                    <path d="M63 125 Q100 112 137 125" className="stroke-hud-cyan/55" />
                    <path d="M65 140 Q100 128 135 140" className="stroke-hud-cyan/50" />
                    <path d="M68 155 Q100 143 132 155" className="stroke-hud-cyan/45" />
                    <path d="M72 168 Q100 158 128 168" className="stroke-hud-cyan/40" />

                    {/* Clavicles */}
                    <line x1="55" y1="88" x2="100" y2="82" className="stroke-hud-cyan/70" />
                    <line x1="145" y1="88" x2="100" y2="82" className="stroke-hud-cyan/70" />

                    {/* Shoulders */}
                    <circle cx="55" cy="90" r="6" className="stroke-hud-cyan/50" />
                    <circle cx="145" cy="90" r="6" className="stroke-hud-cyan/50" />

                    {/* Left Arm */}
                    <line x1="49" y1="93" x2="35" y2="170" className="stroke-hud-cyan/60" />
                    <circle cx="35" cy="170" r="4" className="stroke-hud-cyan/40" />
                    <line x1="35" y1="174" x2="28" y2="250" className="stroke-hud-cyan/50" />
                    {/* Left Hand */}
                    <path d="M28 250 L22 270 M28 250 L26 272 M28 250 L30 272 M28 250 L34 268" className="stroke-hud-cyan/40" />

                    {/* Right Arm */}
                    <line x1="151" y1="93" x2="165" y2="170" className="stroke-hud-cyan/60" />
                    <circle cx="165" cy="170" r="4" className="stroke-hud-cyan/40" />
                    <line x1="165" y1="174" x2="172" y2="250" className="stroke-hud-cyan/50" />
                    {/* Right Hand */}
                    <path d="M172 250 L166 268 M172 250 L170 272 M172 250 L174 272 M172 250 L178 270" className="stroke-hud-cyan/40" />

                    {/* Pelvis */}
                    <path d="M72 180 Q82 200 100 205 Q118 200 128 180" className="stroke-hud-cyan/60" />
                    <path d="M85 195 Q100 215 115 195" className="stroke-hud-cyan/40" />

                    {/* Left Leg */}
                    <line x1="85" y1="210" x2="78" y2="320" className="stroke-hud-cyan/60" />
                    <circle cx="78" cy="320" r="5" className="stroke-hud-cyan/40" />
                    <line x1="78" y1="325" x2="75" y2="430" className="stroke-hud-cyan/50" />
                    {/* Left Foot */}
                    <path d="M75 430 L60 440 L75 445 L85 440 Z" className="stroke-hud-cyan/40" />

                    {/* Right Leg */}
                    <line x1="115" y1="210" x2="122" y2="320" className="stroke-hud-cyan/60" />
                    <circle cx="122" cy="320" r="5" className="stroke-hud-cyan/40" />
                    <line x1="122" y1="325" x2="125" y2="430" className="stroke-hud-cyan/50" />
                    {/* Right Foot */}
                    <path d="M125 430 L115 440 L125 445 L140 440 Z" className="stroke-hud-cyan/40" />

                    {/* Heart glow region */}
                    <circle cx="108" cy="120" r="12" className="stroke-hud-amber/60 heart-glow-animation" strokeWidth="0.8" />
                    <path d="M103 118 L106 115 L108 120 L110 113 L113 118" className="stroke-hud-amber/80" strokeWidth="1" />

                    {/* Pulsing markers on joints */}
                    <circle cx="55" cy="90" r="3" className="fill-hud-cyan/20 stroke-hud-cyan/60 marker-pulse" />
                    <circle cx="145" cy="90" r="3" className="fill-hud-cyan/20 stroke-hud-cyan/60 marker-pulse" />
                    <circle cx="78" cy="320" r="3" className="fill-hud-cyan/20 stroke-hud-cyan/60 marker-pulse" />
                    <circle cx="122" cy="320" r="3" className="fill-hud-cyan/20 stroke-hud-cyan/60 marker-pulse" />
                </svg>
            </div>

            {/* Body part selector tabs */}
            <div className="relative z-20 flex items-center gap-2 mt-4">
                <div className="flex bg-black/50 backdrop-blur-md border border-hud-border rounded-full p-1">
                    {bodyTabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${activeTab === tab
                                ? 'bg-hud-cyan/20 text-hud-cyan border border-hud-cyan/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                                : 'text-white/50 hover:text-white/80 border border-transparent'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 ml-3">
                    <button className="w-7 h-7 flex items-center justify-center rounded-full bg-black/50 border border-hud-border text-white/50 hover:text-white text-xs transition-colors">−</button>
                    <button className="w-7 h-7 flex items-center justify-center rounded-full bg-black/50 border border-hud-border text-white/50 hover:text-white text-xs transition-colors">+</button>
                </div>
            </div>
        </div>
    );
}
