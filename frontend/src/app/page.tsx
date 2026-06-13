'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Activity,
  ArrowRight,
  Brain,
  ChevronDown,
  Cpu,
  Database,
  FileText,
  HeartPulse,
  Radio,
  Server,
  ShieldCheck,
  Stethoscope,
  Waves,
  BarChart3,
} from 'lucide-react'

/* ─── Animated ECG line drawing ─────────────────────────────── */
const ECG_PATH =
  'M0 50 L60 50 L75 50 L85 28 L100 78 L118 8 L136 88 L154 50 L220 50 L235 50 L245 30 L260 74 L278 12 L296 82 L314 50 L380 50 L395 50 L405 29 L420 75 L438 10 L456 84 L474 50 L540 50'

const PCG_PATH =
  'M0 50 C20 30 35 30 50 50 C65 70 80 70 95 50 C115 22 145 22 165 50 C185 78 212 78 235 50 C258 28 280 28 302 50 C322 70 342 70 362 50 C385 18 420 18 445 50 C470 78 500 76 520 50'

function AnimatedECG({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 540 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        <linearGradient id="ecgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00f5d4" stopOpacity="0" />
          <stop offset="30%" stopColor="#00f5d4" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#00c9f0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <filter id="ecgGlow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={ECG_PATH}
        fill="none"
        stroke="url(#ecgGrad)"
        strokeWidth="2.5"
        filter="url(#ecgGlow)"
        strokeLinecap="round"
        style={{
          strokeDasharray: 1200,
          strokeDashoffset: 1200,
          animation: 'drawEcg 2.8s ease forwards',
        }}
      />
    </svg>
  )
}

function AnimatedPCG({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        <linearGradient id="pcgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0" />
          <stop offset="30%" stopColor="#a855f7" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#c084fc" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <filter id="pcgGlow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={PCG_PATH}
        fill="none"
        stroke="url(#pcgGrad)"
        strokeWidth="2"
        filter="url(#pcgGlow)"
        strokeLinecap="round"
        style={{
          strokeDasharray: 1000,
          strokeDashoffset: 1000,
          animation: 'drawEcg 3.2s ease 0.4s forwards',
        }}
      />
    </svg>
  )
}

/* ─── Animated heart glyph ────────────────────────────────────── */
function HeartGlyph() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
      <defs>
        <radialGradient id="heartGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ff6b9d" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ff2d78" stopOpacity="0.05" />
        </radialGradient>
        <filter id="heartGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M60 100 C22 74 12 48 22 30 C30 15 50 14 60 32 C70 14 90 15 98 30 C108 48 98 74 60 100Z"
        fill="url(#heartGrad)"
        stroke="rgba(255,107,157,0.7)"
        strokeWidth="1.5"
        filter="url(#heartGlow)"
      />
      {/* ECG line through heart */}
      <path
        d="M16 60 H34 L40 46 L50 76 L62 34 L72 64 H104"
        fill="none"
        stroke="#00f5d4"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#ecgGlow)"
      />
    </svg>
  )
}

/* ─── Floating metric card ─────────────────────────────────────── */
function MetricCard({
  label,
  value,
  unit,
  color,
  icon,
  delay = 0,
}: {
  label: string
  value: string
  unit: string
  color: string
  icon: React.ReactNode
  delay?: number
}) {
  return (
    <div
      style={{
        background: 'rgba(6, 18, 32, 0.85)',
        border: `1px solid ${color}33`,
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backdropFilter: 'blur(20px)',
        boxShadow: `0 0 20px ${color}22, inset 0 1px 0 rgba(255,255,255,0.05)`,
        animation: `floatUp 0.7s ease ${delay}s both`,
        minWidth: 160,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${color}20`,
          border: `1px solid ${color}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'rgba(180,210,230,0.7)', marginBottom: 2 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#f0faff', lineHeight: 1 }}>{value}</span>
          <span style={{ fontSize: 11, color: 'rgba(180,210,230,0.5)' }}>{unit}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Section wrapper ──────────────────────────────────────────── */
function Section({
  id,
  children,
  className = '',
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <section
      ref={ref}
      id={id}
      className={className}
      style={{
        opacity: 0,
        transform: 'translateY(40px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}
    >
      {children}
    </section>
  )
}

/* ─── Main Component ────────────────────────────────────────────── */
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [typedText, setTypedText] = useState('')
  const fullText = 'AI-Powered Cardiac Monitoring'
  const typingDone = useRef(false)

  // Typing animation
  useEffect(() => {
    if (typingDone.current) return
    let i = 0
    const timer = setInterval(() => {
      setTypedText(fullText.slice(0, i + 1))
      i++
      if (i >= fullText.length) {
        typingDone.current = true
        clearInterval(timer)
      }
    }, 45)
    return () => clearInterval(timer)
  }, [])

  // Scroll tracking
  const handleScroll = useCallback(() => {
    const el = document.documentElement
    const total = el.scrollHeight - el.clientHeight
    const curr = window.scrollY
    setScrollProgress(total <= 0 ? 0 : curr / total)
    setScrolled(curr > 40)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        html { scroll-behavior: smooth; }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #020812;
          color: #f0faff;
          overflow-x: hidden;
        }

        @keyframes drawEcg {
          to { stroke-dashoffset: 0; }
        }

        @keyframes floatUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.15); }
        }

        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          14%       { transform: scale(1.07); }
          28%       { transform: scale(1); }
          42%       { transform: scale(1.05); }
          56%       { transform: scale(1); }
        }

        @keyframes scanBeam {
          0%   { top: 0; opacity: 0.9; }
          100% { top: 100%; opacity: 0; }
        }

        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        @keyframes orbit {
          from { transform: rotate(0deg) translateX(120px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
        }

        @keyframes fieldShift {
          0%   { opacity: 0.6; transform: scale(1) rotate(0deg); }
          50%  { opacity: 1;   transform: scale(1.1) rotate(4deg); }
          100% { opacity: 0.7; transform: scale(1) rotate(0deg); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-10px); }
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }

        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-50px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(50px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .lp-root {
          min-height: 100vh;
          position: relative;
          isolation: isolate;
        }

        /* Background */
        .lp-bg {
          position: fixed;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(ellipse 80% 60% at 20% 20%, rgba(0,245,212,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 80% 80%, rgba(124,58,237,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,200,250,0.04) 0%, transparent 60%),
            linear-gradient(180deg, #020812 0%, #04101e 50%, #020812 100%);
          animation: fieldShift 20s ease-in-out infinite alternate;
        }

        /* Grid overlay */
        .lp-grid {
          position: fixed;
          inset: 0;
          z-index: -1;
          background-image:
            linear-gradient(to right, rgba(0,245,212,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,245,212,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
          -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
        }

        /* Progress bar */
        .lp-progress {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 2px;
          z-index: 200;
          background: rgba(0,245,212,0.1);
        }
        .lp-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00f5d4, #00c9f0, #7c3aed);
          transform-origin: left;
          transition: transform 0.1s;
        }

        /* Navbar */
        .lp-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          padding: 0 max(24px, env(safe-area-inset-left));
          height: 68px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background 0.3s, backdrop-filter 0.3s, border-color 0.3s;
        }
        .lp-nav.scrolled {
          background: rgba(2,8,18,0.85);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(0,245,212,0.12);
        }

        .lp-nav-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          font-size: 20px;
          font-weight: 800;
          color: #f0faff;
          letter-spacing: -0.5px;
        }
        .lp-nav-brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #00f5d4, #00c9f0);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #020812;
          flex-shrink: 0;
        }
        .lp-nav-brand span.gradient {
          background: linear-gradient(90deg, #00f5d4, #00c9f0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .lp-nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .lp-nav-link {
          font-size: 14px;
          font-weight: 500;
          color: rgba(180,210,230,0.75);
          text-decoration: none;
          transition: color 0.2s;
        }
        .lp-nav-link:hover { color: #00f5d4; }

        .lp-nav-cta {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 20px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          background: linear-gradient(135deg, #00f5d4, #00c9f0);
          color: #020812;
          transition: opacity 0.2s, box-shadow 0.2s;
          box-shadow: 0 0 20px rgba(0,245,212,0.3);
        }
        .lp-nav-cta:hover {
          opacity: 0.9;
          box-shadow: 0 0 30px rgba(0,245,212,0.5);
        }

        /* Hero */
        .lp-hero {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: 60px;
          padding: 120px max(48px, env(safe-area-inset-left)) 80px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .lp-hero-left {
          animation: slideInLeft 0.9s ease 0.2s both;
        }

        .lp-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 100px;
          border: 1px solid rgba(0,245,212,0.3);
          background: rgba(0,245,212,0.08);
          font-size: 12px;
          font-weight: 600;
          color: #00f5d4;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }

        .lp-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #00f5d4;
          animation: pulse 1.8s ease-in-out infinite;
          flex-shrink: 0;
        }

        .lp-hero-title {
          font-size: clamp(40px, 5vw, 72px);
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: -2px;
          margin-bottom: 12px;
          color: #f0faff;
        }
        .lp-hero-title .brand {
          background: linear-gradient(90deg, #00f5d4 0%, #00c9f0 50%, #7c3aed 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          background-size: 200% auto;
          animation: shimmer 4s linear infinite;
        }

        .lp-hero-sub {
          font-size: clamp(18px, 2vw, 26px);
          font-weight: 400;
          color: rgba(180,210,230,0.9);
          margin-bottom: 32px;
          line-height: 1.4;
          min-height: 1.4em;
        }

        .lp-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: #00f5d4;
          margin-left: 2px;
          vertical-align: middle;
          animation: blink 1s step-end infinite;
        }

        .lp-hero-desc {
          font-size: 16px;
          color: rgba(150,185,210,0.75);
          line-height: 1.7;
          margin-bottom: 40px;
          max-width: 480px;
        }

        .lp-hero-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 40px;
        }
        .lp-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 8px;
          border: 1px solid rgba(0,245,212,0.2);
          background: rgba(0,245,212,0.06);
          font-size: 13px;
          font-weight: 500;
          color: rgba(180,210,230,0.85);
        }
        .lp-pill svg { color: #00f5d4; }

        .lp-hero-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .lp-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          background: linear-gradient(135deg, #00f5d4, #00c9f0);
          color: #020812;
          box-shadow: 0 0 30px rgba(0,245,212,0.35), 0 4px 20px rgba(0,245,212,0.2);
          transition: all 0.2s;
          white-space: nowrap;
        }
        .lp-btn-primary:hover {
          box-shadow: 0 0 50px rgba(0,245,212,0.55), 0 4px 30px rgba(0,245,212,0.3);
          transform: translateY(-1px);
        }

        .lp-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 13px 24px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid rgba(0,245,212,0.3);
          color: rgba(180,210,230,0.9);
          background: rgba(0,245,212,0.06);
          transition: all 0.2s;
          white-space: nowrap;
        }
        .lp-btn-secondary:hover {
          border-color: rgba(0,245,212,0.6);
          background: rgba(0,245,212,0.1);
          color: #00f5d4;
        }

        /* Hero right — dashboard mockup */
        .lp-hero-right {
          animation: slideInRight 0.9s ease 0.3s both;
          position: relative;
        }

        .lp-dashboard-card {
          background: rgba(6, 16, 32, 0.9);
          border: 1px solid rgba(0,245,212,0.2);
          border-radius: 20px;
          padding: 24px;
          backdrop-filter: blur(30px);
          box-shadow:
            0 0 60px rgba(0,245,212,0.08),
            0 30px 60px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.05);
          animation: float 6s ease-in-out infinite;
        }

        .lp-dashboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .lp-chrome-dots {
          display: flex;
          gap: 6px;
        }
        .lp-chrome-dots span {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .lp-chrome-dots span:nth-child(1) { background: #ff5f57; }
        .lp-chrome-dots span:nth-child(2) { background: #ffbd2e; }
        .lp-chrome-dots span:nth-child(3) { background: #28c840; }

        .lp-online-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 100px;
          background: rgba(0,245,212,0.1);
          border: 1px solid rgba(0,245,212,0.25);
          font-size: 11px;
          font-weight: 600;
          color: #00f5d4;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .lp-signal-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(150,185,210,0.6);
          margin-bottom: 4px;
        }

        .lp-signal-row {
          height: 56px;
          margin-bottom: 14px;
        }

        .lp-heart-area {
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 10px 0;
        }
        .lp-heart-glyph {
          width: 80px;
          height: 80px;
          animation: heartbeat 1.8s ease-in-out infinite;
        }

        .lp-metrics-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 16px;
        }

        .lp-metric-mini {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .lp-metric-mini-label {
          font-size: 10px;
          color: rgba(150,185,210,0.55);
          margin-bottom: 4px;
        }
        .lp-metric-mini-value {
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
        }
        .lp-metric-mini-unit {
          font-size: 10px;
          color: rgba(150,185,210,0.5);
          margin-left: 2px;
        }

        .lp-status-normal {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          color: #00f5d4;
          font-weight: 600;
          margin-top: 12px;
        }
        .lp-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #00f5d4;
          animation: pulse 1.5s ease-in-out infinite;
        }

        /* Sections */
        .lp-section {
          padding: 100px max(48px, env(safe-area-inset-left));
          max-width: 1280px;
          margin: 0 auto;
        }

        .lp-section-eyebrow {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #00f5d4;
          margin-bottom: 14px;
        }

        .lp-section-title {
          font-size: clamp(28px, 3.5vw, 48px);
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -1px;
          color: #f0faff;
          margin-bottom: 16px;
        }

        .lp-section-subtitle {
          font-size: 17px;
          color: rgba(150,185,210,0.7);
          line-height: 1.7;
          max-width: 600px;
          margin-bottom: 60px;
        }

        /* Architecture flow */
        .lp-arch-flow {
          display: flex;
          align-items: stretch;
          gap: 0;
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .lp-arch-item {
          display: flex;
          align-items: center;
          flex: 1;
          min-width: 160px;
        }

        .lp-arch-card {
          flex: 1;
          background: rgba(6,18,32,0.8);
          border: 1px solid rgba(0,245,212,0.15);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          backdrop-filter: blur(20px);
          transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
        }
        .lp-arch-card:hover {
          border-color: rgba(0,245,212,0.4);
          box-shadow: 0 0 30px rgba(0,245,212,0.1);
          transform: translateY(-4px);
        }

        .lp-arch-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(0,245,212,0.15), rgba(0,200,240,0.08));
          border: 1px solid rgba(0,245,212,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00f5d4;
          margin-bottom: 4px;
        }

        .lp-arch-title {
          font-size: 15px;
          font-weight: 700;
          color: #f0faff;
        }
        .lp-arch-detail {
          font-size: 11px;
          font-weight: 600;
          color: #00f5d4;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .lp-arch-desc {
          font-size: 13px;
          color: rgba(150,185,210,0.65);
          line-height: 1.5;
        }

        .lp-arch-arrow {
          color: rgba(0,245,212,0.4);
          flex-shrink: 0;
          margin: 0 8px;
        }

        /* Capabilities grid */
        .lp-cap-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }

        .lp-cap-card {
          background: rgba(6,18,32,0.7);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 28px;
          transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
          cursor: default;
        }
        .lp-cap-card:hover {
          border-color: rgba(0,245,212,0.3);
          box-shadow: 0 0 24px rgba(0,245,212,0.08);
          transform: translateY(-4px);
        }

        .lp-cap-icon-wrap {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
        }

        .lp-cap-title {
          font-size: 16px;
          font-weight: 700;
          color: #f0faff;
          margin-bottom: 10px;
        }
        .lp-cap-desc {
          font-size: 14px;
          color: rgba(150,185,210,0.65);
          line-height: 1.6;
        }

        /* Stats strip */
        .lp-stats {
          background: rgba(6,18,32,0.6);
          border-top: 1px solid rgba(0,245,212,0.1);
          border-bottom: 1px solid rgba(0,245,212,0.1);
          padding: 60px max(48px, env(safe-area-inset-left));
        }
        .lp-stats-inner {
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 40px;
        }
        .lp-stat {
          text-align: center;
        }
        .lp-stat-number {
          font-size: clamp(36px, 4vw, 56px);
          font-weight: 900;
          letter-spacing: -2px;
          background: linear-gradient(90deg, #00f5d4, #00c9f0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1;
          margin-bottom: 8px;
        }
        .lp-stat-label {
          font-size: 14px;
          color: rgba(150,185,210,0.65);
          font-weight: 500;
        }

        /* Demo flow */
        .lp-timeline {
          display: flex;
          flex-direction: column;
          gap: 0;
          position: relative;
        }
        .lp-timeline::before {
          content: '';
          position: absolute;
          left: 27px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, #00f5d4, #7c3aed, transparent);
        }

        .lp-step {
          display: flex;
          align-items: flex-start;
          gap: 24px;
          padding: 28px 28px 28px 0;
          position: relative;
        }

        .lp-step-node {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        .lp-step-num {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #020812;
          border: 1px solid rgba(0,245,212,0.4);
          font-size: 10px;
          font-weight: 800;
          color: #00f5d4;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .lp-step-body { flex: 1; padding-top: 10px; }
        .lp-step-title {
          font-size: 18px;
          font-weight: 700;
          color: #f0faff;
          margin-bottom: 8px;
        }
        .lp-step-desc {
          font-size: 14px;
          color: rgba(150,185,210,0.65);
          line-height: 1.6;
          max-width: 480px;
        }

        /* Tech stack */
        .lp-tech-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .lp-tech-card {
          background: rgba(6,18,32,0.6);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 20px;
          transition: border-color 0.3s, transform 0.3s;
        }
        .lp-tech-card:hover {
          border-color: rgba(0,245,212,0.25);
          transform: translateY(-2px);
        }

        .lp-tech-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          color: #00f5d4;
          font-size: 14px;
          font-weight: 700;
        }

        .lp-tech-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .lp-tech-list li {
          font-size: 13px;
          color: rgba(150,185,210,0.7);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .lp-tech-list li::before {
          content: '';
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(0,245,212,0.5);
          flex-shrink: 0;
        }

        /* Footer / CTA */
        .lp-cta {
          padding: 120px max(48px, env(safe-area-inset-left));
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .lp-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,245,212,0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        .lp-cta-title {
          font-size: clamp(32px, 4vw, 56px);
          font-weight: 900;
          letter-spacing: -1.5px;
          line-height: 1.1;
          color: #f0faff;
          margin-bottom: 20px;
        }

        .lp-cta-desc {
          font-size: 17px;
          color: rgba(150,185,210,0.7);
          max-width: 500px;
          margin: 0 auto 48px;
          line-height: 1.7;
        }

        .lp-footer {
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: 32px max(48px, env(safe-area-inset-left));
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .lp-footer-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
          font-weight: 700;
          color: #f0faff;
        }

        .lp-footer-copy {
          font-size: 13px;
          color: rgba(150,185,210,0.45);
        }

        /* Scroll indicator */
        .lp-scroll-hint {
          position: absolute;
          bottom: 36px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: rgba(150,185,210,0.45);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          animation: float 3s ease-in-out infinite;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .lp-hero {
            grid-template-columns: 1fr;
            padding-top: 100px;
            gap: 40px;
          }
          .lp-hero-right { order: -1; max-width: 480px; margin: 0 auto; }
          .lp-arch-flow { flex-direction: column; }
          .lp-arch-arrow { transform: rotate(90deg); margin: 0; }
          .lp-stats-inner { grid-template-columns: repeat(2, 1fr); }
          .lp-nav-links { display: none; }
        }

        @media (max-width: 480px) {
          .lp-hero { padding: 90px 20px 60px; }
          .lp-section { padding: 60px 20px; }
          .lp-stats { padding: 40px 20px; }
          .lp-stats-inner { grid-template-columns: 1fr 1fr; gap: 24px; }
          .lp-cta { padding: 80px 20px; }
          .lp-footer { padding: 24px 20px; }
        }
      `}</style>

      <div className="lp-root">
        <div className="lp-bg" aria-hidden="true" />
        <div className="lp-grid" aria-hidden="true" />

        {/* Progress bar */}
        <div className="lp-progress" aria-hidden="true">
          <div className="lp-progress-fill" style={{ transform: `scaleX(${scrollProgress})` }} />
        </div>

        {/* Navbar */}
        <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`} aria-label="Main navigation">
          <Link href="/" className="lp-nav-brand">
            <div className="lp-nav-brand-icon">
              <HeartPulse size={18} />
            </div>
            <span className="gradient">AscultiCor</span>
          </Link>

          <div className="lp-nav-links">
            {[
              { label: 'Architecture', href: '#architecture' },
              { label: 'Capabilities', href: '#capabilities' },
              { label: 'Demo Flow', href: '#demo-flow' },
              { label: 'Technology', href: '#technology' },
            ].map((item) => (
              <a key={item.href} href={item.href} className="lp-nav-link">
                {item.label}
              </a>
            ))}
          </div>

          <Link href="/auth/login" className="lp-nav-cta">
            Enter Platform
            <ArrowRight size={15} />
          </Link>
        </nav>

        {/* Hero */}
        <div className="lp-hero" style={{ position: 'relative' }}>
          {/* Left */}
          <div className="lp-hero-left">
            <div className="lp-hero-badge">
              <div className="lp-pulse-dot" />
              Medical AI · IoT · Real-Time
            </div>

            <h1 className="lp-hero-title">
              <span className="brand">AscultiCor</span>
              <br />
              <span style={{ color: '#f0faff' }}>Cardiac Intelligence</span>
            </h1>

            <p className="lp-hero-sub">
              {typedText}
              <span className="lp-cursor" />
            </p>

            <p className="lp-hero-desc">
              Real-time ECG and PCG acquisition via ESP32, three trained AI models,
              multi-tenant clinical dashboard, and LLM-assisted reporting — all in one
              end-to-end IoT platform.
            </p>

            <div className="lp-hero-pills">
              {[
                { icon: <Cpu size={13} />, label: 'ESP32 Hardware' },
                { icon: <Radio size={13} />, label: 'MQTT Telemetry' },
                { icon: <Brain size={13} />, label: '3 AI Models' },
                { icon: <ShieldCheck size={13} />, label: 'Supabase RLS' },
              ].map((pill) => (
                <div key={pill.label} className="lp-pill">
                  {pill.icon}
                  {pill.label}
                </div>
              ))}
            </div>

            <div className="lp-hero-actions">
              <Link href="/auth/login" className="lp-btn-primary">
                Enter Dashboard
                <ArrowRight size={16} />
              </Link>
              <a href="#architecture" className="lp-btn-secondary">
                View Architecture
              </a>
            </div>
          </div>

          {/* Right — Dashboard mockup */}
          <div className="lp-hero-right">
            <div className="lp-dashboard-card">
              {/* Chrome dots */}
              <div className="lp-dashboard-header">
                <div className="lp-chrome-dots">
                  <span /><span /><span />
                </div>
                <div className="lp-online-badge">
                  <div className="lp-status-dot" />
                  Live Session
                </div>
              </div>

              {/* ECG */}
              <div>
                <div className="lp-signal-label">ECG — Electrocardiogram</div>
                <div className="lp-signal-row">
                  <AnimatedECG />
                </div>
              </div>

              {/* Heart */}
              <div className="lp-heart-area">
                <div className="lp-heart-glyph">
                  <HeartGlyph />
                </div>
              </div>

              {/* PCG */}
              <div>
                <div className="lp-signal-label">PCG — Phonocardiogram</div>
                <div className="lp-signal-row">
                  <AnimatedPCG />
                </div>
              </div>

              {/* Metrics */}
              <div className="lp-metrics-row">
                <div className="lp-metric-mini">
                  <div className="lp-metric-mini-label">Heart Rate</div>
                  <div>
                    <span className="lp-metric-mini-value" style={{ color: '#ff6b9d' }}>72</span>
                    <span className="lp-metric-mini-unit">BPM</span>
                  </div>
                </div>
                <div className="lp-metric-mini">
                  <div className="lp-metric-mini-label">AI Confidence</div>
                  <div>
                    <span className="lp-metric-mini-value" style={{ color: '#00f5d4' }}>94</span>
                    <span className="lp-metric-mini-unit">%</span>
                  </div>
                </div>
                <div className="lp-metric-mini">
                  <div className="lp-metric-mini-label">PCG Class</div>
                  <div>
                    <span className="lp-metric-mini-value" style={{ color: '#00c9f0', fontSize: 16 }}>Normal</span>
                  </div>
                </div>
                <div className="lp-metric-mini">
                  <div className="lp-metric-mini-label">ECG (AAMI)</div>
                  <div>
                    <span className="lp-metric-mini-value" style={{ color: '#a855f7', fontSize: 16 }}>N-Class</span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="lp-status-normal">
                <div className="lp-status-dot" />
                All systems nominal · Demo stream
              </div>
            </div>
          </div>

          {/* Scroll hint */}
          <div className="lp-scroll-hint" style={{ gridColumn: '1/-1' }}>
            <ChevronDown size={20} />
            Scroll to explore
          </div>
        </div>

        {/* Stats strip */}
        <div className="lp-stats">
          <div className="lp-stats-inner">
            {[
              { number: '3', label: 'Trained AI Models (PCG + ECG)' },
              { number: '360Hz', label: 'ECG Sampling Rate (MIT-BIH)' },
              { number: '22kHz', label: 'PCG Audio Resolution' },
              { number: '100%', label: 'Multi-tenant RLS Isolation' },
            ].map((stat) => (
              <div key={stat.label} className="lp-stat">
                <div className="lp-stat-number">{stat.number}</div>
                <div className="lp-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture */}
        <Section id="architecture">
          <div className="lp-section">
            <p className="lp-section-eyebrow">System Architecture</p>
            <h2 className="lp-section-title">
              From embedded sensors<br />to clinical intelligence
            </h2>
            <p className="lp-section-subtitle">
              A complete end-to-end pipeline: hardware acquisition, MQTT telemetry,
              AI inference, secure PostgreSQL storage, and a real-time clinical dashboard.
            </p>

            <div className="lp-arch-flow">
              {[
                { icon: <Cpu size={22} />, title: 'ESP32 Device', detail: 'ECG / PCG Acquisition', desc: 'Captures cardiac signals at 500 Hz (ECG) and 22 kHz (PCG) and streams them over MQTT.' },
                { icon: <Radio size={22} />, title: 'MQTT Broker', detail: 'Mosquitto Messaging', desc: 'Per-device credential isolation with ACL topic restrictions for secure telemetry routing.' },
                { icon: <Server size={22} />, title: 'FastAPI Inference', detail: 'Python ML Service', desc: 'Preprocesses signals and runs three independent models in parallel with graceful degradation.' },
                { icon: <Database size={22} />, title: 'Supabase', detail: 'PostgreSQL + RLS', desc: 'Row-level security isolates every organization\'s clinical data. Signed storage URLs for audio.' },
                { icon: <BarChart3 size={22} />, title: 'Next.js Dashboard', detail: 'Clinical UI', desc: 'Real-time waveforms, AI predictions, 3D heart visualization, patient management, and reports.' },
                { icon: <FileText size={22} />, title: 'LLM Reports', detail: 'AI-Assisted Summaries', desc: 'Claude-powered clinical report drafts from session data, queued via n8n automation.' },
              ].map((node, i, arr) => (
                <div key={node.title} className="lp-arch-item">
                  <article className="lp-arch-card">
                    <div className="lp-arch-icon">{node.icon}</div>
                    <div className="lp-arch-title">{node.title}</div>
                    <div className="lp-arch-detail">{node.detail}</div>
                    <p className="lp-arch-desc">{node.desc}</p>
                  </article>
                  {i < arr.length - 1 && (
                    <ArrowRight size={20} className="lp-arch-arrow" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Capabilities */}
        <Section id="capabilities">
          <div className="lp-section">
            <p className="lp-section-eyebrow">Capabilities</p>
            <h2 className="lp-section-title">
              Every layer of the<br />cardiac monitoring stack
            </h2>
            <p className="lp-section-subtitle">
              Six integrated capabilities built from scratch — hardware to report generation.
            </p>

            <div className="lp-cap-grid">
              {[
                {
                  icon: <Activity size={24} />,
                  color: '#00f5d4',
                  bg: 'rgba(0,245,212,0.1)',
                  border: 'rgba(0,245,212,0.15)',
                  title: 'Real-time ECG Monitoring',
                  desc: 'Streaming electrocardiogram acquisition at 360 Hz with per-session waveform buffering, session replay, and AAMI-class arrhythmia detection.',
                },
                {
                  icon: <Stethoscope size={24} />,
                  color: '#a855f7',
                  bg: 'rgba(168,85,247,0.1)',
                  border: 'rgba(168,85,247,0.15)',
                  title: 'PCG Heart-Sound Classification',
                  desc: 'XGBoost murmur detection and CNN severity grading on 22 kHz phonocardiogram audio, trained on PhysioNet CirCor 2022 dataset.',
                },
                {
                  icon: <Brain size={24} />,
                  color: '#00c9f0',
                  bg: 'rgba(0,201,240,0.1)',
                  border: 'rgba(0,201,240,0.15)',
                  title: 'Three-Model AI Pipeline',
                  desc: 'XGBoost (PCG class), CNN (PCG severity), and BiLSTM (ECG arrhythmia) run in parallel with per-model confidence scores and graceful degradation.',
                },
                {
                  icon: <Cpu size={24} />,
                  color: '#f59e0b',
                  bg: 'rgba(245,158,11,0.1)',
                  border: 'rgba(245,158,11,0.15)',
                  title: 'IoT Device Management',
                  desc: 'ESP32 provisioning, per-device MQTT credentials, battery and signal telemetry, online/offline status, and device-to-session binding.',
                },
                {
                  icon: <ShieldCheck size={24} />,
                  color: '#10b981',
                  bg: 'rgba(16,185,129,0.1)',
                  border: 'rgba(16,185,129,0.15)',
                  title: 'Multi-tenant Security',
                  desc: 'Supabase PostgreSQL with row-level security. Each organization\'s patients, sessions, devices, and reports are completely isolated at the database layer.',
                },
                {
                  icon: <FileText size={24} />,
                  color: '#f472b6',
                  bg: 'rgba(244,114,182,0.1)',
                  border: 'rgba(244,114,182,0.15)',
                  title: 'LLM Clinical Reports',
                  desc: 'Claude AI generates structured clinical-style session summaries, queued via n8n workflows with email delivery and PDF export.',
                },
              ].map((cap) => (
                <article
                  key={cap.title}
                  className="lp-cap-card"
                  style={{ borderColor: cap.border }}
                >
                  <div
                    className="lp-cap-icon-wrap"
                    style={{ background: cap.bg, border: `1px solid ${cap.border}`, color: cap.color }}
                  >
                    {cap.icon}
                  </div>
                  <h3 className="lp-cap-title">{cap.title}</h3>
                  <p className="lp-cap-desc">{cap.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </Section>

        {/* Demo Flow */}
        <Section id="demo-flow">
          <div className="lp-section">
            <p className="lp-section-eyebrow">Demo Flow</p>
            <h2 className="lp-section-title">
              From device registration<br />to clinical insight
            </h2>
            <p className="lp-section-subtitle">
              A complete session in five steps — all demonstrated live with real hardware.
            </p>

            <div className="lp-timeline">
              {[
                {
                  num: '01',
                  icon: <Cpu size={22} />,
                  color: '#00f5d4',
                  bg: 'rgba(0,245,212,0.12)',
                  title: 'Provision the ESP32 Device',
                  desc: 'Register the device in the dashboard, generate per-device MQTT credentials, and flash the firmware. The device appears online within seconds.',
                },
                {
                  num: '02',
                  icon: <HeartPulse size={22} />,
                  color: '#ff6b9d',
                  bg: 'rgba(255,107,157,0.12)',
                  title: 'Create a Patient & Start Session',
                  desc: 'Select or create a patient record, choose a device, and open a monitored recording window for synchronized ECG and PCG capture.',
                },
                {
                  num: '03',
                  icon: <Waves size={22} />,
                  color: '#a855f7',
                  bg: 'rgba(168,85,247,0.12)',
                  title: 'Stream ECG / PCG Signals',
                  desc: 'Live waveforms appear on the dashboard in real time via MQTT → FastAPI → Supabase. Signal quality indicators update per second.',
                },
                {
                  num: '04',
                  icon: <Brain size={22} />,
                  color: '#00c9f0',
                  bg: 'rgba(0,201,240,0.12)',
                  title: 'Run AI Inference',
                  desc: 'XGBoost + CNN classify the PCG, BiLSTM classifies the ECG. Results appear with confidence scores and AAMI classifications within the session.',
                },
                {
                  num: '05',
                  icon: <FileText size={22} />,
                  color: '#f59e0b',
                  bg: 'rgba(245,158,11,0.12)',
                  title: 'Review Results & Generate Report',
                  desc: 'Inspect the dashboard predictions, waveform history, and 3D heart view. Generate a Claude-powered clinical summary with a single click.',
                },
              ].map((step) => (
                <article key={step.num} className="lp-step">
                  <div
                    className="lp-step-node"
                    style={{ background: step.bg, border: `1px solid ${step.color}33`, color: step.color }}
                  >
                    {step.icon}
                    <span className="lp-step-num">{step.num}</span>
                  </div>
                  <div className="lp-step-body">
                    <h3 className="lp-step-title">{step.title}</h3>
                    <p className="lp-step-desc">{step.desc}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Section>

        {/* Tech Stack */}
        <Section id="technology">
          <div className="lp-section">
            <p className="lp-section-eyebrow">Technology</p>
            <h2 className="lp-section-title">
              Production-grade stack<br />across every layer
            </h2>
            <p className="lp-section-subtitle">
              Carefully chosen technologies that mirror real clinical IoT system boundaries.
            </p>

            <div className="lp-tech-grid">
              {[
                { icon: <BarChart3 size={16} />, title: 'Frontend', items: ['Next.js 14', 'TypeScript', 'Recharts', 'Three.js / 3D', 'TailwindCSS'] },
                { icon: <Server size={16} />, title: 'Backend', items: ['FastAPI', 'Python 3.11', 'Pydantic v2', 'Uvicorn', 'asyncio'] },
                { icon: <Brain size={16} />, title: 'AI / Signal', items: ['TensorFlow / Keras', 'XGBoost', 'SciPy', 'Librosa', 'scikit-learn'] },
                { icon: <Radio size={16} />, title: 'IoT / Infra', items: ['ESP32 Firmware', 'MQTT / Mosquitto', 'Docker Compose', 'NGINX + TLS', 'n8n Automation'] },
                { icon: <Database size={16} />, title: 'Data & Auth', items: ['Supabase', 'PostgreSQL 17', 'Row-Level Security', 'pg_cron', 'Supabase Storage'] },
              ].map((group) => (
                <article key={group.title} className="lp-tech-card">
                  <div className="lp-tech-header">
                    {group.icon}
                    {group.title}
                  </div>
                  <ul className="lp-tech-list">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </Section>

        {/* CTA */}
        <Section id="cta">
          <div className="lp-cta">
            <p className="lp-section-eyebrow" style={{ textAlign: 'center' }}>Graduation Project 2026</p>
            <h2 className="lp-cta-title">
              Ready to explore<br />
              <span style={{
                background: 'linear-gradient(90deg, #00f5d4, #00c9f0, #7c3aed)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                AscultiCor?
              </span>
            </h2>
            <p className="lp-cta-desc">
              A fully integrated medical IoT platform — real hardware, real AI,
              real multi-tenant data isolation. Built by the AscultiCor team.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/auth/login" className="lp-btn-primary" style={{ padding: '16px 36px', fontSize: 16 }}>
                Enter Dashboard
                <ArrowRight size={18} />
              </Link>
              <a href="#architecture" className="lp-btn-secondary" style={{ padding: '16px 28px', fontSize: 16 }}>
                Explore Architecture
              </a>
            </div>
          </div>
        </Section>

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-footer-brand">
            <div className="lp-nav-brand-icon" style={{ width: 28, height: 28, borderRadius: 8 }}>
              <HeartPulse size={14} />
            </div>
            <span>AscultiCor</span>
            <span style={{ color: 'rgba(150,185,210,0.4)', fontWeight: 400, fontSize: 13 }}>
              AI-Powered Cardiac Monitoring Platform
            </span>
          </div>
          <p className="lp-footer-copy">
            Graduation Project 2026 · Biomedical Engineering
          </p>
        </footer>
      </div>
    </>
  )
}
