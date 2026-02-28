'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { Heart, Mail, Lock, ArrowRight, Activity, Eye, EyeOff, User, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (isForgotPassword) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
        })
        if (resetError) throw resetError
        setMessage('Password reset link sent! Check your email inbox.')
      } else if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: fullName,
            },
          },
        })
        if (signUpError) throw signUpError
        setMessage('Account created! Check your email for a confirmation link.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        router.push('/')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (mode: 'login' | 'signup' | 'forgot') => {
    setError(null)
    setMessage(null)
    setIsSignUp(mode === 'signup')
    setIsForgotPassword(mode === 'forgot')
  }

  const getTitle = () => {
    if (isForgotPassword) return 'Reset password'
    if (isSignUp) return 'Create your account'
    return 'Welcome back'
  }

  const getSubtitle = () => {
    if (isForgotPassword) return "Enter your email and we'll send you a reset link"
    if (isSignUp) return 'Start monitoring cardiac health today'
    return 'Sign in to your monitoring dashboard'
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── Left Hero Panel ─── */}
      <div
        className="hidden lg:flex lg:w-[52%] relative overflow-hidden items-center justify-center"
        style={{ background: 'var(--gradient-hero)' }}
      >
        {/* Ambient glow orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-teal-500/[0.07] rounded-full blur-[120px]" style={{ animation: 'float 8s ease-in-out infinite' }} />
          <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-teal-600/[0.08] rounded-full blur-[120px]" style={{ animation: 'float 10s ease-in-out infinite', animationDelay: '2s' }} />
          <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] bg-blue-500/[0.04] rounded-full blur-[100px]" style={{ animation: 'float 12s ease-in-out infinite', animationDelay: '4s' }} />
        </div>

        {/* Animated ECG line SVG */}
        <svg className="absolute bottom-[15%] left-0 w-full opacity-[0.15]" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path
            d="M0,60 L150,60 L180,60 L200,25 L220,95 L240,15 L260,105 L280,60 L310,60 L500,60 L530,60 L550,25 L570,95 L590,15 L610,105 L630,60 L660,60 L850,60 L880,60 L900,25 L920,95 L940,15 L960,105 L980,60 L1010,60 L1200,60"
            fill="none"
            stroke="url(#ecg-gradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 8px hsl(172 66% 50% / 0.4))' }}
          >
            <animate attributeName="stroke-dasharray" values="0 2400;2400 0" dur="3s" repeatCount="indefinite" />
          </path>
          <defs>
            <linearGradient id="ecg-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(172, 66%, 50%)" stopOpacity="0.3" />
              <stop offset="50%" stopColor="hsl(172, 66%, 55%)" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(217, 91%, 65%)" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Hero content */}
        <div className="relative z-10 text-center px-12 max-w-lg scale-in">
          <div className="flex items-center justify-center mb-10">
            <div className="relative flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-2xl ring-1 ring-white/10">
              <svg viewBox="0 0 32 32" className="w-10 h-10" aria-hidden="true">
                <path d="M3 16h6l2.2-6.2 3.6 12.4 2.8-7.2 1.8 1.8H29" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white/20 animate-pulse" />
              <div className="absolute inset-0 rounded-3xl" style={{ boxShadow: '0 0 60px -10px hsl(172 66% 50% / 0.4)' }} />
            </div>
          </div>

          <h1 className="text-5xl font-bold text-white mb-5 tracking-tight leading-[1.1]">
            Asculti<span className="text-teal-300">Cor</span>
          </h1>
          <p className="text-lg text-teal-200/70 leading-relaxed font-light">
            AI-Powered Cardiac Auscultation
            <br />and Prediction Platform
          </p>
          <p className="text-sm text-teal-300/40 mt-4 font-light">
            Real-time PCG & ECG analysis using heart sounds
            <br />and machine learning
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2.5 justify-center mt-12">
            {['Heart Sound Analysis', 'ML Inference', 'ECG / PCG', 'IoT Devices'].map((feature) => (
              <span key={feature} className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/[0.06] text-teal-200/70 border border-white/[0.08] backdrop-blur-md">
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Right Form Panel ─── */}
      <div className="flex-1 flex items-center justify-center bg-background px-4 sm:px-6 lg:px-8 relative">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/[0.03] rounded-full blur-[150px] pointer-events-none" />

        <div className="max-w-[380px] w-full space-y-7 fade-in">
          {/* Mobile logo */}
          <div className="text-center lg:hidden">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg">
                <svg viewBox="0 0 32 32" className="logo-mark" aria-hidden="true">
                  <path d="M3 16h6l2.2-6.2 3.6 12.4 2.8-7.2 1.8 1.8H29" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-foreground tracking-tight">
                Asculti<span className="gradient-text">Cor</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-light">AI-Powered Cardiac Auscultation</p>
          </div>

          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {getTitle()}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground font-light">
              {getSubtitle()}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 p-4 fade-in">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Success */}
          {message && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 p-4 fade-in">
              <div className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name — sign up only */}
            {isSignUp && (
              <div className="fade-in">
                <label htmlFor="fullName" className="block text-sm font-medium text-foreground mb-1.5">
                  Full Name
                </label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors duration-300" />
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required={isSignUp}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Dr. John Smith"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors duration-300" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password — hidden for forgot password */}
            {!isForgotPassword && (
              <div className="fade-in">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-foreground">
                    Password
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors duration-300" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10 pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors duration-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isSignUp && (
                  <p className="text-xs text-muted-foreground mt-1.5">Must be at least 6 characters</p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full gap-2 py-3"
            >
              {loading ? (
                <Activity className="w-4 h-4 animate-spin" />
              ) : null}
              {loading
                ? (isForgotPassword ? 'Sending...' : isSignUp ? 'Creating account...' : 'Signing in...')
                : (isForgotPassword ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in')
              }
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            {/* Switch mode */}
            <div className="text-center">
              {isForgotPassword ? (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  ← Back to sign in
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode(isSignUp ? 'login' : 'signup')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isSignUp
                    ? <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
                    : <>Don&apos;t have an account? <span className="text-primary font-medium">Sign up</span></>
                  }
                </button>
              )}
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-[11px] text-muted-foreground/50 pt-4">
            Secured with end-to-end encryption
          </p>
        </div>
      </div>
    </div>
  )
}
