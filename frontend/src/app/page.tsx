'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
    Activity,
    Heart,
    Cpu,
    Wifi,
    Database,
    ArrowRight,
    Terminal,
    ShieldAlert,
    LineChart,
    Stethoscope
} from 'lucide-react'

// Hero Abstract Rings implementation replacing HeartVisualization3D
function HeroRings() {
    return (
        <div className="flex items-center justify-center h-[500px] w-full max-w-[500px] mx-auto rounded-full overflow-hidden relative">
            <div className="absolute inset-0 bg-hud-cyan/5 animate-pulse rounded-full blur-3xl opacity-50" />
            <div className="w-64 h-64 border-[1px] border-hud-cyan/20 rounded-full flex items-center justify-center animate-spin-slow relative shadow-[0_0_50px_rgba(0,240,255,0.15)]">
                <div className="w-48 h-48 border border-hud-violet/30 rounded-full flex items-center justify-center relative backdrop-blur-sm">
                    <div className="absolute w-2 h-2 bg-hud-cyan rounded-full top-0 -mt-1 shadow-[0_0_10px_#00f0ff]" />
                    <div className="w-32 h-32 border-[2px] border-dashed border-hud-cyan/40 rounded-full animate-spin-reverse flex items-center justify-center">
                        <div className="absolute w-2 h-2 bg-hud-violet rounded-full bottom-0 -mb-1 shadow-[0_0_10px_#8a2be2]" />
                        <Activity className="w-12 h-12 text-hud-cyan animate-pulse" />
                    </div>
                </div>
            </div>
            {/* Ambient scanning lines overlay */}
            <div className="absolute inset-0 scan-line-animation pointer-events-none opacity-30" />
        </div>
    )
}

export default function LandingPage() {
    return (
        <div className="page-wrapper overflow-x-hidden" style={{ backgroundColor: 'var(--hud-bg-base)' }}>
            {/* Background gradients for T013 */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 right-1/4 w-[800px] h-[800px] bg-hud-cyan/10 rounded-full blur-[150px] mix-blend-screen pulse" />
                <div className="absolute bottom-1/4 left-1/4 w-[600px] h-[600px] bg-hud-violet/10 rounded-full blur-[120px] mix-blend-screen opacity-70" />
            </div>

            <div className="relative z-10 page-content font-sans flex flex-col pt-12">

                {/* Navbar-ish header for Landing page if needed, or rely on global layout.
            Assuming `layout.tsx` wrapper doesn't provide Nav for `/` or it provides the generic one.
            We will assume the design stands alone. */}

                {/* ================= HERO SECTION (T007) ================= */}
                <section className="min-h-[85vh] flex items-center mb-24">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
                        {/* Left Content */}
                        <div className="space-y-8 fade-in">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full hud-glass-panel border-hud-cyan/30 text-xs font-semibold uppercase tracking-widest text-hud-cyan shadow-[0_0_15px_rgba(0,240,255,0.1)]">
                                <Activity className="w-3.5 h-3.5" />
                                <span>Next-Gen Cardiac Monitoring</span>
                            </div>

                            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-tight">
                                AI-Powered <br />
                                <span className="gradient-text">Auscultation</span>
                            </h1>

                            <p className="text-lg md:text-xl text-white/60 max-w-xl font-light leading-relaxed">
                                AscultiCor combines advanced IoT sensors with deep learning to provide
                                real-time cardiac diagnostics. Connect your ESP32 stethoscope, stream audio,
                                and receive instant AI predictions.
                            </p>

                            <div className="flex flex-wrap items-center gap-4 pt-4">
                                <Link
                                    href="/dashboard"
                                    className="btn-primary px-8 py-3.5 text-sm uppercase tracking-widest flex items-center gap-2 group shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:shadow-[0_0_30px_rgba(0,240,255,0.4)]"
                                >
                                    Open Dashboard
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </Link>
                                <a
                                    href="#architecture"
                                    className="px-8 py-3.5 text-sm uppercase tracking-widest font-semibold text-white/50 hover:text-white border border-white/10 hover:border-white/30 hover:bg-white/5 rounded-lg transition-all"
                                >
                                    View Architecture
                                </a>
                            </div>
                        </div>

                        {/* Right Content: 3D Visualization (T008) */}
                        <div className="relative slide-up flex justify-center lg:justify-end">
                            <div className="w-full max-w-[600px] h-[500px] md:h-[600px] relative">
                                {/* Decorative scanning rings */}
                                <div className="absolute inset-x-0 bottom-0 top-1/2 border-t-2 border-hud-cyan/0 rounded-full scale-150 transform-gpu rotate-x-65 border-t-hud-cyan/10 animate-spin-slow pointer-events-none" />
                                <div className="absolute inset-x-12 bottom-12 top-1/2 border-t border-hud-violet/0 rounded-full scale-125 transform-gpu rotate-x-60 border-t-hud-violet/20 animate-spin-reverse pointer-events-none" />

                                <HeroRings />
                            </div>
                        </div>
                    </div>
                </section>


                {/* ================= FEATURES SECTION (T009) ================= */}
                <section className="py-24 space-y-12">
                    <div className="text-center space-y-4 fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
                        <h2 className="text-3xl font-bold text-white tracking-widest uppercase">System Capabilities</h2>
                        <p className="text-white/50 max-w-2xl mx-auto">Full-stack hardware and software integration for modern telecardiology.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FeatureCard
                            icon={Cpu}
                            title="IoT Telemetry"
                            description="ESP32-based hardware reads digital stethoscopes via I2S and transmits via secure MQTT."
                            delay="0.2s"
                        />
                        <FeatureCard
                            icon={LineChart}
                            title="Real-time Processing"
                            description="Low latency live streaming of PCG waveforms with instantaneous visualization on the HUD."
                            delay="0.3s"
                        />
                        <FeatureCard
                            icon={ShieldAlert}
                            title="AI Inference"
                            description="Machine learning models deployed as microservices classify murmurs and anomalies instantly."
                            delay="0.4s"
                        />
                    </div>
                </section>


                {/* ================= ARCHITECTURE SECTION (T010) ================= */}
                <section id="architecture" className="py-24 space-y-16 border-t border-white/5">
                    <div className="text-center space-y-4">
                        <h2 className="text-3xl font-bold text-white tracking-widest uppercase">Pipeline Architecture</h2>
                        <p className="text-white/50 max-w-2xl mx-auto">From patient chest to clinical dashboard.</p>
                    </div>

                    <div className="relative max-w-5xl mx-auto hud-glass-panel p-8 md:p-12 overflow-hidden rounded-2xl">
                        {/* Background grid */}
                        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.03] pointer-events-none" />

                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2 relative z-10">

                            {/* Node 1 */}
                            <ArchNode icon={Stethoscope} title="ESP32 Kit" color="amber" border="amber" />
                            <ArchArrow />

                            {/* Node 2 */}
                            <ArchNode icon={Wifi} title="MQTT Broker" color="cyan" border="cyan" />
                            <ArchArrow />

                            {/* Node 3 */}
                            <ArchNode icon={Activity} title="AI Inference" color="violet" border="violet" />
                            <ArchArrow />

                            {/* Node 4 */}
                            <ArchNode icon={Database} title="Supabase DB" color="emerald" border="emerald" />
                            <ArchArrow />

                            {/* Node 5 */}
                            <ArchNode icon={Terminal} title="Next.js HUD" color="blue" border="blue" />

                        </div>
                    </div>
                </section>


                {/* ================= HOW TO START SECTION (T011) ================= */}
                <section className="py-24">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-widest uppercase mb-6">Quick Start Guide</h2>
                            <p className="text-white/60 mb-8 leading-relaxed">
                                Deploy the entire stack locally using Docker Compose. Connect your flashed ESP32
                                apparatus and begin analyzing cardiac rhythms in minutes.
                            </p>

                            <div className="space-y-6">
                                <StepItem num="01" title="Configure Environment">
                                    Set up <code className="text-hud-cyan text-xs bg-hud-cyan/10 px-1 py-0.5 rounded">.env</code> keys for Supabase and MQTT.
                                </StepItem>
                                <StepItem num="02" title="Launch Services">
                                    Run <code className="text-hud-cyan text-xs bg-hud-cyan/10 px-1 py-0.5 rounded">docker-compose up -d</code> to spin up the broker and AI API.
                                </StepItem>
                                <StepItem num="03" title="Access Dashboard">
                                    Navigate to <code className="text-hud-cyan text-xs bg-hud-cyan/10 px-1 py-0.5 rounded">/dashboard</code> and login to view telemetry.
                                </StepItem>
                            </div>
                        </div>

                        <div className="glass-card p-6 md:p-8 relative group">
                            <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-4">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                <span className="ml-4 font-mono text-xs text-white/40">Terminal</span>
                            </div>
                            <pre className="font-mono text-sm leading-loose">
                                <span className="text-hud-cyan">~</span> <span className="text-white/50">$</span> git clone https://github.com/Mahmoudmetwall2y/...
                                <span className="text-hud-cyan">~/AscultiCor</span> <span className="text-white/50">$</span> cd infra
                                <span className="text-hud-cyan">~/AscultiCor/infra</span> <span className="text-white/50">$</span> docker-compose up -d
                                <span className="text-white/80">Creating network &quot;infra_default&quot;
                                    Creating mqtt_broker ... <span className="text-green-400">done</span>
                                    Creating ai_worker   ... <span className="text-green-400">done</span></span>
                                <span className="text-hud-cyan">~/AscultiCor/infra</span> <span className="text-white/50">$</span> cd ../frontend
                                <span className="text-hud-cyan">~/AscultiCor/frontend</span> <span className="text-white/50">$</span> npm run dev
                            </pre>
                        </div>
                    </div>
                </section>


                {/* ================= FOOTER (T012) ================= */}
                <footer className="py-8 border-t border-white/10 mt-12 flex flex-col md:flex-row items-center justify-between text-sm text-white/40">
                    <div className="flex items-center gap-2 mb-4 md:mb-0">
                        <Heart className="w-4 h-4 text-hud-cyan" />
                        <span className="font-semibold tracking-wider text-white">Asculti<span className="text-hud-cyan">Cor</span></span>
                        <span className="ml-2">© 2026</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/dashboard" className="hover:text-hud-cyan transition-colors">Dashboard</Link>
                        <a href="https://github.com/Mahmoudmetwall2y/Graduation-project" target="_blank" rel="noreferrer" className="hover:text-hud-cyan transition-colors">Repository</a>
                    </div>
                </footer>

            </div>
        </div>
    )
}

// Helper Components
function FeatureCard({ icon: Icon, title, description, delay }: { icon: any, title: string, description: string, delay: string }) {
    return (
        <div className="glass-card p-6 md:p-8 hover:-translate-y-2 transition-transform duration-300 group slide-up cursor-default" style={{ animationDelay: delay, animationFillMode: 'both' }}>
            <div className="w-12 h-12 rounded-xl bg-hud-cyan/10 flex items-center justify-center mb-6 group-hover:bg-hud-cyan/20 group-hover:scale-110 transition-all border border-hud-cyan/20 group-hover:border-hud-cyan/50">
                <Icon className="w-6 h-6 text-hud-cyan" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-wide mb-3">{title}</h3>
            <p className="text-white/50 leading-relaxed text-sm">
                {description}
            </p>
        </div>
    )
}

function ArchNode({ icon: Icon, title, color, border }: { icon: any, title: string, color: string, border: string }) {
    const colorMap: Record<string, string> = {
        amber: 'text-amber-400',
        cyan: 'text-hud-cyan',
        violet: 'text-hud-violet',
        emerald: 'text-emerald-400',
        blue: 'text-blue-400'
    }
    const bgMap: Record<string, string> = {
        amber: 'bg-amber-400/10 border-amber-400/30',
        cyan: 'bg-hud-cyan/10 border-hud-cyan/30',
        violet: 'bg-hud-violet/10 border-hud-violet/30',
        emerald: 'bg-emerald-400/10 border-emerald-400/30',
        blue: 'bg-blue-400/10 border-blue-400/30'
    }

    return (
        <div className="flex flex-col items-center gap-3 relative group">
            <div className={`w-16 h-16 rounded-xl ${bgMap[border]} flex items-center justify-center border shadow-lg group-hover:scale-110 transition-transform`}>
                <Icon className={`w-7 h-7 ${colorMap[color]}`} />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-widest text-center">{title}</span>
        </div>
    )
}

function ArchArrow() {
    return (
        <div className="hidden md:flex flex-1 items-center justify-center min-w-[30px] relative">
            <div className="h-0.5 w-full bg-white/10 relative overflow-hidden">
                {/* Animated scanline passing through the pipeline */}
                <div className="absolute top-0 bottom-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-hud-cyan to-transparent translate-x-[-100%] group-hover:animate-[shimmer_2s_infinite]" />
            </div>
            <ArrowRight className="w-4 h-4 text-white/30 absolute right-0 translate-x-1/2 bg-[var(--hud-surface-glass)]" />
        </div>
    )
}

function StepItem({ num, title, children }: { num: string, title: string, children: React.ReactNode }) {
    return (
        <div className="flex gap-4 slide-up">
            <div className="text-3xl font-black text-white/5">{num}</div>
            <div>
                <h4 className="text-lg font-bold text-white tracking-widest uppercase mb-1">{title}</h4>
                <p className="text-sm text-white/50">{children}</p>
            </div>
        </div>
    )
}
