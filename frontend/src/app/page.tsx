'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  FileText,
  Github,
  HeartPulse,
  Stethoscope,
  Waves,
  Cpu,
  Database,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react'
import styles from './showcase.module.css'

/* ── Logo component using actual brand asset ────────────── */
function AscultiCorLogo({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="AscultiCor Logo"
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
    />
  )
}

/* ── Data ──────────────────────────────────────────────────── */
const features = [
  {
    icon: HeartPulse,
    title: 'Real-time ECG',
    desc: 'Live electrocardiogram monitoring with beat-by-beat analysis and arrhythmia detection.',
    accent: '#3de7c7',
  },
  {
    icon: Waves,
    title: 'PCG Classification',
    desc: 'AI-powered heart sound analysis classifying normal, murmur, and abnormal phonocardiograms.',
    accent: '#59c7ff',
  },
  {
    icon: Brain,
    title: 'AI Predictions',
    desc: 'Deep learning models delivering confidence-scored classifications in near real-time.',
    accent: '#ff8b3d',
  },
  {
    icon: FileText,
    title: 'Clinical Reports',
    desc: 'Auto-generated PDF reports with session data, AI findings, and clinical recommendations.',
    accent: '#a78bfa',
  },
]

const steps = [
  { num: '1', title: 'Record', desc: 'Capture ECG & PCG signals through connected IoT devices in real-time.' },
  { num: '2', title: 'Analyze', desc: 'AI models process waveforms, classify heart sounds, and detect anomalies.' },
  { num: '3', title: 'Report', desc: 'Generate clinical-grade reports with predictions & recommendations.' },
]

const techItems = [
  { name: 'Next.js', emoji: '⚡' },
  { name: 'React', emoji: '⚛️' },
  { name: 'TypeScript', emoji: '🔷' },
  { name: 'Supabase', emoji: '🟢' },
  { name: 'TensorFlow', emoji: '🧠' },
  { name: 'MQTT', emoji: '📡' },
  { name: 'Python', emoji: '🐍' },
  { name: 'Docker', emoji: '🐳' },
  { name: 'PostgreSQL', emoji: '🐘' },
  { name: 'Tailwind CSS', emoji: '🎨' },
]

const teamMembers = [
  { name: 'Mahmoud Metwally', initials: 'MM', role: 'Full Stack Developer' },
  { name: 'Team Member 2', initials: 'T2', role: 'ML Engineer' },
  { name: 'Team Member 3', initials: 'T3', role: 'Hardware Engineer' },
  { name: 'Team Member 4', initials: 'T4', role: 'Backend Developer' },
]

/* ── ECG Path Data ─────────────────────────────────────────── */
const ecgPath = 'M0,150 L80,150 L100,150 L120,148 L140,152 L170,150 L190,150 L210,145 L215,80 L225,200 L235,60 L245,190 L260,120 L275,150 L300,150 L340,150 L360,148 L380,152 L400,150 L420,150 L440,145 L445,90 L455,195 L465,65 L475,185 L490,125 L505,150 L530,150 L570,150 L590,148 L610,152 L640,150 L660,150 L680,145 L685,85 L695,198 L705,62 L715,188 L730,122 L745,150 L770,150 L800,150'

/* ── Component ─────────────────────────────────────────────── */
export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  /* Scroll reveal observer */
  useEffect(() => {
    if (!rootRef.current) return
    const nodes = Array.from(rootRef.current.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.inView)
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -5% 0px' }
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  /* Scroll progress + navbar state */
  useEffect(() => {
    const update = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      setScrollProgress(total <= 0 ? 0 : Math.min(Math.max(window.scrollY / total, 0), 1))
      setScrolled(window.scrollY > 50)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div ref={rootRef} className={styles.root}>
      {/* Ambient orbs */}
      <div className={styles.ambientOrb1} />
      <div className={styles.ambientOrb2} />
      <div className={styles.ambientOrb3} />

      {/* Progress bar */}
      <div className={styles.progressRail}>
        <span className={styles.progressFill} style={{ transform: `scaleX(${scrollProgress})` }} />
      </div>

      <div className={styles.shell}>
        {/* ═══ Navbar ═══ */}
        <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
          <Link href="/" className={styles.navBrand}>
            <span className={styles.navLogoMark}>
              <AscultiCorLogo size={36} />
            </span>
            <span className={styles.navBrandText}>
              <span className={styles.navBrandTitle}>AscultiCor</span>
              <span className={styles.navBrandSub}>Pulse Intelligence</span>
            </span>
          </Link>

          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#how-it-works" className={styles.navLink}>How It Works</a>
            <a href="#tech" className={styles.navLink}>Technology</a>
            <a href="#team" className={styles.navLink}>Team</a>
          </div>

          <Link href="/dashboard" className={styles.navCta}>
            Launch Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </nav>

        {/* ═══ Hero ═══ */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroContent}>
              <div className={`${styles.heroBadge} ${styles.reveal}`} data-reveal>
                <span className={styles.heroBadgeDot} />
                AI-Powered Cardiac Platform
              </div>

              <h1 className={`${styles.heroTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
                <span className={styles.heroTitleLine1}>Intelligent</span>
                <span className={styles.heroTitleLine2}>Cardiac Auscultation</span>
              </h1>

              <p className={`${styles.heroSubtitle} ${styles.reveal} ${styles.d2}`} data-reveal>
                Monitor, analyze, and classify heart sounds in real-time using AI.
                From ECG waveforms to PCG phonocardiograms — clinical intelligence at your fingertips.
              </p>

              <div className={`${styles.heroActions} ${styles.reveal} ${styles.d3}`} data-reveal>
                <Link href="/dashboard" className={styles.primaryBtn}>
                  Launch Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="https://github.com/Mahmoudmetwall2y/Graduation-project"
                  target="_blank"
                  rel="noreferrer"
                  className={styles.secondaryBtn}
                >
                  <Github className="w-4 h-4" />
                  View Source
                </a>
              </div>
            </div>

            {/* ECG Waveform visual */}
            <div className={`${styles.heroVisual} ${styles.reveal} ${styles.d2}`} data-reveal>
              <div className={styles.ecgContainer}>
                <svg viewBox="0 0 800 300" className={styles.ecgSvg} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="ecgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#3de7c7" />
                      <stop offset="50%" stopColor="#59c7ff" />
                      <stop offset="100%" stopColor="#ff8b3d" />
                    </linearGradient>
                  </defs>
                  <path d={ecgPath} className={styles.ecgGlow} />
                  <path d={ecgPath} className={styles.ecgLine} />
                  <circle cx="745" cy="150" className={styles.ecgPulse} />
                </svg>


              </div>
            </div>
          </div>
        </section>

        {/* ═══ Features ═══ */}
        <section id="features" className={styles.features}>
          <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal>
            <span className={styles.sectionEyebrowLine} />
            Core Capabilities
          </p>
          <h2 className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal>
            Everything you need for cardiac signal intelligence
          </h2>
          <p className={`${styles.sectionSubtitle} ${styles.reveal} ${styles.d2}`} data-reveal>
            A complete pipeline from signal capture to clinical report — powered by deep learning and real-time IoT.
          </p>

          <div className={styles.featuresGrid}>
            {features.map((feat, index) => {
              const Icon = feat.icon
              return (
                <article
                  key={feat.title}
                  className={`${styles.featureCard} ${styles.reveal} ${styles[`d${index + 1}` as keyof typeof styles]}`}
                  data-reveal
                  style={{ '--card-accent': feat.accent } as React.CSSProperties}
                >
                  <div className={styles.featureIcon}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className={styles.featureTitle}>{feat.title}</h3>
                  <p className={styles.featureDesc}>{feat.desc}</p>
                </article>
              )
            })}
          </div>
        </section>

        {/* ═══ How It Works ═══ */}
        <section id="how-it-works" className={styles.howItWorks}>
          <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal style={{ justifyContent: 'center' }}>
            <span className={styles.sectionEyebrowLine} />
            How It Works
          </p>
          <h2 className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal style={{ marginInline: 'auto' }}>
            From signal to insight in seconds
          </h2>
          <p className={`${styles.sectionSubtitle} ${styles.reveal} ${styles.d2}`} data-reveal style={{ marginInline: 'auto' }}>
            Three simple steps to transform raw cardiac signals into actionable clinical intelligence.
          </p>

          <div className={styles.stepsGrid}>
            {steps.map((step, index) => (
              <div
                key={step.num}
                className={`${styles.stepCard} ${styles.reveal} ${styles[`d${index + 1}` as keyof typeof styles]}`}
                data-reveal
              >
                <div className={styles.stepNumber}>{step.num}</div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDesc}>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ Tech Stack ═══ */}
        <section id="tech" className={styles.techStack}>
          <div style={{ textAlign: 'center' }}>
            <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal style={{ justifyContent: 'center' }}>
              <span className={styles.sectionEyebrowLine} />
              Technology Stack
            </p>
            <h2 className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal style={{ marginInline: 'auto' }}>
              Built with modern technologies
            </h2>
            <p className={`${styles.sectionSubtitle} ${styles.reveal} ${styles.d2}`} data-reveal style={{ marginInline: 'auto' }}>
              A robust full-stack architecture combining web, AI, and IoT technologies.
            </p>
          </div>

          <div className={`${styles.techGrid} ${styles.reveal} ${styles.d3}`} data-reveal>
            {techItems.map((tech) => (
              <span key={tech.name} className={styles.techChip}>
                <span className={styles.techChipIcon}>{tech.emoji}</span>
                {tech.name}
              </span>
            ))}
          </div>
        </section>

        {/* ═══ Team ═══ */}
        <section id="team" className={styles.team}>
          <p className={`${styles.sectionEyebrow} ${styles.reveal}`} data-reveal style={{ justifyContent: 'center' }}>
            <span className={styles.sectionEyebrowLine} />
            The Team
          </p>
          <h2 className={`${styles.sectionTitle} ${styles.reveal} ${styles.d1}`} data-reveal style={{ marginInline: 'auto' }}>
            Graduation Project Team
          </h2>
          <p className={`${styles.teamSubtitle} ${styles.reveal} ${styles.d2}`} data-reveal>
            Faculty of Engineering — Biomedical Engineering Department
          </p>

          <div className={`${styles.teamGrid} ${styles.reveal} ${styles.d3}`} data-reveal>
            {teamMembers.map((member) => (
              <div key={member.name} className={styles.teamCard}>
                <div className={styles.teamAvatar}>{member.initials}</div>
                <h3 className={styles.teamName}>{member.name}</h3>
                <p className={styles.teamRole}>{member.role}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ CTA Banner ═══ */}
        <section className={`${styles.ctaBanner} ${styles.reveal}`} data-reveal>
          <h2 className={styles.ctaTitle}>Ready to explore cardiac intelligence?</h2>
          <p className={styles.ctaSubtitle}>Launch the dashboard and experience real-time AI-powered cardiac analysis.</p>
          <div className={styles.heroActions} style={{ justifyContent: 'center' }}>
            <Link href="/dashboard" className={styles.primaryBtn}>
              Launch Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/Mahmoudmetwall2y/Graduation-project"
              target="_blank"
              rel="noreferrer"
              className={styles.secondaryBtn}
            >
              <Github className="w-4 h-4" />
              View on GitHub
            </a>
          </div>
        </section>

        {/* ═══ Footer ═══ */}
        <footer className={styles.footer}>
          <div className={styles.footerContent}>
            <div className={styles.footerBrand}>
              <AscultiCorLogo size={24} />
              <span className={styles.footerBrandText}>AscultiCor</span>
            </div>
            <p className={styles.footerSub}>
              Made with <span className={styles.footerHeart}>❤</span> — Graduation Project 2026
              <br />
              Faculty of Engineering • Biomedical Engineering Department
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
