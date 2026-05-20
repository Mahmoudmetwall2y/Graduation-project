'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  Cpu,
  Database,
  FileText,
  HeartPulse,
  Radio,
  Server,
  ShieldCheck,
  Stethoscope,
  Users,
  Waves,
} from 'lucide-react'
import styles from './showcase.module.css'

type IconItem = {
  icon: LucideIcon
  title: string
  description: string
}

const navItems = [
  { label: 'Architecture', href: '#architecture' },
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Demo Flow', href: '#demo-flow' },
  { label: 'Technology', href: '#technology' },
]

const architectureNodes: Array<IconItem & { detail: string }> = [
  {
    icon: Cpu,
    title: 'ESP32 Device',
    detail: 'ECG / PCG acquisition',
    description: 'Embedded hardware captures biomedical signals and device telemetry.',
  },
  {
    icon: Radio,
    title: 'MQTT Broker',
    detail: 'Mosquitto messaging',
    description: 'Signal packets and health events move through a lightweight telemetry channel.',
  },
  {
    icon: Server,
    title: 'FastAPI Inference',
    detail: 'Python model service',
    description: 'Preprocessing and model execution transform buffered signals into demo classifications.',
  },
  {
    icon: Database,
    title: 'Supabase',
    detail: 'PostgreSQL + RLS',
    description: 'Authentication, database policies, sessions, devices, and report metadata are centralized.',
  },
  {
    icon: BarChart3,
    title: 'Next.js Dashboard',
    detail: 'Clinical operations UI',
    description: 'Supervisors can inspect sessions, telemetry, waveforms, and model outputs.',
  },
  {
    icon: FileText,
    title: 'Clinical Report',
    detail: 'Draft report workflow',
    description: 'LLM-assisted summaries remain positioned as reviewable project reports.',
  },
]

const capabilities: IconItem[] = [
  {
    icon: Activity,
    title: 'Real-time ECG monitoring',
    description: 'Streaming electrocardiogram views designed for session review and signal inspection.',
  },
  {
    icon: Stethoscope,
    title: 'PCG heart-sound classification',
    description: 'Phonocardiogram processing that supports supervised normal, murmur, and abnormal demo states.',
  },
  {
    icon: Brain,
    title: 'AI inference pipeline',
    description: 'A FastAPI model service coordinates preprocessing, classification, confidence display, and state storage.',
  },
  {
    icon: Cpu,
    title: 'Device telemetry',
    description: 'ESP32 device health, online status, stream activity, and acquisition metadata remain visible.',
  },
  {
    icon: ShieldCheck,
    title: 'Supabase-secured clinical data',
    description: 'Auth, PostgreSQL, and row-level security organize access to project data and workflow records.',
  },
  {
    icon: FileText,
    title: 'Report generation',
    description: 'Draft clinical-style reports summarize sessions for demonstration and supervisor review.',
  },
]

const demoFlow: Array<IconItem & { step: string }> = [
  {
    step: '01',
    icon: Cpu,
    title: 'Register device',
    description: 'Provision the ESP32 endpoint and associate telemetry with the platform workspace.',
  },
  {
    step: '02',
    icon: HeartPulse,
    title: 'Start session',
    description: 'Open a monitored recording window for synchronized ECG and PCG capture.',
  },
  {
    step: '03',
    icon: Waves,
    title: 'Stream ECG/PCG',
    description: 'Route waveform buffers through MQTT while preserving session context.',
  },
  {
    step: '04',
    icon: Brain,
    title: 'Run AI inference',
    description: 'Apply preprocessing and model classification through the backend inference service.',
  },
  {
    step: '05',
    icon: FileText,
    title: 'Review insights',
    description: 'Inspect dashboard signals, model state, telemetry, and generated report drafts.',
  },
]

const techGroups = [
  {
    icon: BarChart3,
    title: 'Frontend',
    items: ['Next.js', 'React', 'TypeScript', 'Recharts', 'Three.js'],
  },
  {
    icon: Server,
    title: 'Backend',
    items: ['FastAPI', 'Python'],
  },
  {
    icon: Brain,
    title: 'AI / Signal Processing',
    items: ['TensorFlow', 'XGBoost', 'SciPy', 'Librosa'],
  },
  {
    icon: Radio,
    title: 'Infrastructure',
    items: ['Docker Compose', 'Mosquitto', 'NGINX'],
  },
  {
    icon: Database,
    title: 'Data / Auth',
    items: ['Supabase', 'PostgreSQL', 'RLS'],
  },
]

const academicCards: IconItem[] = [
  {
    icon: FileText,
    title: 'Graduation Project',
    description: 'A complete biomedical AI-IoT platform built for technical demonstration and evaluation.',
  },
  {
    icon: Stethoscope,
    title: 'Biomedical Engineering',
    description: 'Focused on cardiac auscultation, ECG/PCG signal workflows, and supervised clinical review.',
  },
  {
    icon: Users,
    title: 'AscultiCor Team',
    description: 'Integrated hardware, backend inference, secure data, dashboard UX, and reporting into one system.',
  },
]

function AscultiCorLogo({
  width = 170,
  height = 56,
}: {
  width?: number
  height?: number
}) {
  return (
    <Image
      src="/asculticor-logo-wordmark.png"
      alt="AscultiCor logo"
      width={width}
      height={height}
      className={styles.logoImage}
      priority={width >= 150}
      unoptimized
    />
  )
}

function SignalWaveform({ variant }: { variant: 'ecg' | 'pcg' }) {
  const path =
    variant === 'ecg'
      ? 'M0 62 L42 62 L54 62 L62 48 L73 82 L86 18 L99 88 L112 62 L154 62 L166 62 L176 50 L186 78 L199 24 L213 84 L226 62 L272 62 L284 62 L294 47 L305 80 L318 20 L331 86 L344 62 L390 62 L402 62 L412 51 L424 76 L436 28 L448 82 L462 62 L520 62'
      : 'M0 64 C15 50 28 50 42 64 C55 78 67 78 80 64 C96 44 116 44 132 64 C149 84 168 84 186 64 C202 48 220 48 236 64 C252 80 268 80 284 64 C302 38 330 38 348 64 C365 89 390 88 408 64 C426 46 448 46 466 64 C484 80 502 80 520 64'

  return (
    <svg className={`${styles.signalSvg} ${variant === 'ecg' ? styles.ecgSignal : styles.pcgSignal}`} viewBox="0 0 520 120" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} className={styles.signalGlow} pathLength={1} />
      <path d={path} className={styles.signalLine} pathLength={1} />
    </svg>
  )
}

function LiveSystemSnapshot() {
  return (
    <section id="snapshot" className={`${styles.snapshotPanel} ${styles.reveal} ${styles.d2}`} data-reveal aria-labelledby="snapshot-title">
      <div className={styles.panelChrome}>
        <span />
        <span />
        <span />
      </div>

      <div className={styles.snapshotHeader}>
        <div>
          <p className={styles.panelEyebrow}>Synthetic demo stream</p>
          <h2 id="snapshot-title" className={styles.snapshotTitle}>Live System Snapshot</h2>
        </div>
        <div className={styles.onlineBadge}>
          <span className={styles.onlineDot} aria-hidden="true" />
          Online
        </div>
      </div>

      <div className={styles.diagnosticStage} aria-hidden="true">
        <div className={styles.scanColumn}>
          <span>ECG</span>
          <SignalWaveform variant="ecg" />
        </div>
        <div className={styles.heartScanner}>
          <svg viewBox="0 0 120 120" className={styles.heartGlyph}>
            <path d="M60 101 C23 75 15 51 24 34 C31 20 49 19 60 34 C71 19 89 20 96 34 C105 51 97 75 60 101Z" />
            <path d="M18 62 H38 L45 48 L55 78 L66 36 L76 66 H102" />
          </svg>
          <span className={styles.scanBeam} />
        </div>
        <div className={styles.scanColumn}>
          <span>PCG</span>
          <SignalWaveform variant="pcg" />
        </div>
      </div>

      <dl className={styles.snapshotReadouts}>
        <div className={styles.readout}>
          <dt>Device status</dt>
          <dd><span className={styles.inlineStatusDot} aria-hidden="true" />Online</dd>
        </div>
        <div className={styles.readout}>
          <dt>AI confidence value</dt>
          <dd>0.86 demo score</dd>
        </div>
        <div className={styles.readout}>
          <dt>Latest prediction state</dt>
          <dd>Review candidate</dd>
        </div>
        <div className={styles.readout}>
          <dt>Report queue status</dt>
          <dd>2 drafts pending</dd>
        </div>
      </dl>

      <p className={styles.snapshotNotice}>Demo visualization only. No real patient data is shown.</p>
    </section>
  )
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const scrollRoot = root.closest('.app-main') as HTMLElement | null
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add(styles.inView))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.inView)
            observer.unobserve(entry.target)
          }
        }
      },
      { root: scrollRoot, threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const scrollRoot = root?.closest('.app-main') as HTMLElement | null

    const update = () => {
      if (scrollRoot) {
        const total = scrollRoot.scrollHeight - scrollRoot.clientHeight
        const current = scrollRoot.scrollTop
        setScrollProgress(total <= 0 ? 0 : Math.min(Math.max(current / total, 0), 1))
        setScrolled(current > 32)
        return
      }

      const total = document.documentElement.scrollHeight - window.innerHeight
      setScrollProgress(total <= 0 ? 0 : Math.min(Math.max(window.scrollY / total, 0), 1))
      setScrolled(window.scrollY > 32)
    }

    update()
    const target: HTMLElement | Window = scrollRoot ?? window
    target.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      target.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.progressRail} aria-hidden="true">
        <span className={styles.progressFill} style={{ transform: `scaleX(${scrollProgress})` }} />
      </div>

      <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`} aria-label="Landing page">
        <Link href="/" className={styles.navBrand}>
          <span className={styles.navLogoWordmark}>
            <AscultiCorLogo />
          </span>
        </Link>

        <div className={styles.navLinks}>
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </a>
          ))}
        </div>

        <Link href="/auth/login" className={styles.navCta}>
          Login
          <ArrowRight className={styles.linkIcon} aria-hidden="true" />
        </Link>
      </nav>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroContent}>
            <p className={`${styles.heroBadge} ${styles.reveal}`} data-reveal>
              <span className={styles.badgePulse} aria-hidden="true" />
              Medical AI-IoT Command Center
            </p>

            <h1 id="hero-title" className={`${styles.heroTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
              <span>AscultiCor</span>
              <span>AI-Powered Cardiac Auscultation &amp; Monitoring</span>
            </h1>

            <p className={`${styles.heroSubtitle} ${styles.reveal} ${styles.d2}`} data-reveal>
              Real-time ECG and PCG acquisition, ML classification, device telemetry, and clinical reporting in one integrated platform.
            </p>

            <div className={`${styles.heroPillars} ${styles.reveal} ${styles.d3}`} data-reveal aria-label="Platform pillars">
              <span><Cpu aria-hidden="true" />ESP32 acquisition</span>
              <span><Radio aria-hidden="true" />MQTT telemetry</span>
              <span><Brain aria-hidden="true" />AI inference</span>
              <span><BarChart3 aria-hidden="true" />Next.js dashboard</span>
            </div>

            <div className={`${styles.heroActions} ${styles.reveal} ${styles.d4}`} data-reveal>
              <Link href="/auth/login" className={styles.primaryBtn}>
                Enter Dashboard
                <ArrowRight className={styles.linkIcon} aria-hidden="true" />
              </Link>
              <a href="#architecture" className={styles.secondaryBtn}>
                View Architecture
              </a>
              <a href="#demo-flow" className={styles.ghostBtn}>
                Demo Flow
              </a>
            </div>
          </div>

          <LiveSystemSnapshot />
        </section>

        <section id="architecture" className={styles.section} aria-labelledby="architecture-title">
          <div className={styles.sectionHeader}>
            <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal>System Architecture</p>
            <h2 id="architecture-title" className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
              From embedded cardiac signals to reviewable dashboard intelligence.
            </h2>
            <p className={`${styles.sectionSubtitle} ${styles.reveal} ${styles.d2}`} data-reveal>
              The platform connects acquisition hardware, MQTT messaging, inference services, secure data storage, and clinical reporting into one project pipeline.
            </p>
          </div>

          <div className={`${styles.architectureFlow} ${styles.reveal} ${styles.d3}`} data-reveal>
            {architectureNodes.map((node, index) => {
              const Icon = node.icon
              return (
                <div className={styles.architectureItem} key={node.title}>
                  <article className={styles.architectureNode}>
                    <div className={styles.nodeIcon}>
                      <Icon aria-hidden="true" />
                    </div>
                    <div>
                      <h3>{node.title}</h3>
                      <p className={styles.nodeDetail}>{node.detail}</p>
                      <p>{node.description}</p>
                    </div>
                  </article>
                  {index < architectureNodes.length - 1 && (
                    <ArrowRight className={styles.architectureArrow} aria-hidden="true" />
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section id="capabilities" className={styles.section} aria-labelledby="capabilities-title">
          <div className={styles.sectionHeader}>
            <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal>Capabilities</p>
            <h2 id="capabilities-title" className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
              Built to demonstrate biomedical depth and production discipline.
            </h2>
          </div>

          <div className={styles.capabilityGrid}>
            {capabilities.map((capability, index) => {
              const Icon = capability.icon
              const delayClass = styles[`d${(index % 6) + 1}` as keyof typeof styles]
              return (
                <article key={capability.title} className={`${styles.capabilityCard} ${styles.reveal} ${delayClass}`} data-reveal>
                  <Icon className={styles.cardIcon} aria-hidden="true" />
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section id="demo-flow" className={styles.section} aria-labelledby="demo-flow-title">
          <div className={styles.sectionHeader}>
            <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal>Demo Flow</p>
            <h2 id="demo-flow-title" className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
              A clear project journey from registered device to reviewed insights.
            </h2>
          </div>

          <div className={styles.demoTimeline}>
            {demoFlow.map((step, index) => {
              const Icon = step.icon
              const delayClass = styles[`d${(index % 5) + 1}` as keyof typeof styles]
              return (
                <article key={step.step} className={`${styles.demoStep} ${styles.reveal} ${delayClass}`} data-reveal>
                  <span className={styles.stepNumber}>{step.step}</span>
                  <div className={styles.stepIcon}>
                    <Icon aria-hidden="true" />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section id="technology" className={styles.section} aria-labelledby="technology-title">
          <div className={styles.sectionHeader}>
            <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal>Technology</p>
            <h2 id="technology-title" className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
              Stack groups that mirror the actual system boundaries.
            </h2>
          </div>

          <div className={styles.techGrid}>
            {techGroups.map((group, index) => {
              const Icon = group.icon
              const delayClass = styles[`d${(index % 5) + 1}` as keyof typeof styles]
              return (
                <article key={group.title} className={`${styles.techGroup} ${styles.reveal} ${delayClass}`} data-reveal>
                  <div className={styles.techHeader}>
                    <Icon aria-hidden="true" />
                    <h3>{group.title}</h3>
                  </div>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </section>

        <section id="academic" className={styles.academicSection} aria-labelledby="academic-title">
          <div className={styles.sectionHeader}>
            <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal>Academic Context</p>
            <h2 id="academic-title" className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
              Graduation Project | Biomedical Engineering | AscultiCor Team
            </h2>
          </div>

          <div className={styles.academicGrid}>
            {academicCards.map((card, index) => {
              const Icon = card.icon
              const delayClass = styles[`d${(index % 3) + 1}` as keyof typeof styles]
              return (
                <article key={card.title} className={`${styles.academicCard} ${styles.reveal} ${delayClass}`} data-reveal>
                  <Icon aria-hidden="true" />
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </article>
              )
            })}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.footerLogoWordmark}>
              <AscultiCorLogo width={132} height={44} />
            </span>
            <span>AscultiCor — AI-Powered Cardiac Monitoring Platform</span>
          </div>
          <p>Graduation Project 2026</p>
        </div>
      </footer>
    </div>
  )
}
