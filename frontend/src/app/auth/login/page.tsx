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
      {/* Left side — Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center"
        style={{ background: 'var(--gradient-hero)' }}>
        {/* Animated background elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-red-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        {/* ECG line animation */}
        <svg className="absolute bottom-32 left-0 right-0 w-full opacity-20" viewBox="0 0 800 100" preserveAspectRatio="none">
          <path
            d="M0,50 L100,50 L120,50 L140,20 L160,80 L180,10 L200,90 L220,50 L240,50 L400,50 L420,50 L440,20 L460,80 L480,10 L500,90 L520,50 L540,50 L700,50 L720,50 L740,20 L760,80 L780,10 L800,50"
            fill="none"
            stroke="hsl(172, 66%, 45%)"
            strokeWidth="2"
            className="animate-pulse"
          />
        </svg>

        <div className="relative z-10 text-center px-12 max-w-lg">
          <div className="flex items-center justify-center mb-8">
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-2xl">
              <Heart className="w-10 h-10 text-white" strokeWidth={2} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white/20 animate-pulse" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
            SONOCARDIA
          </h1>
          <p className="text-lg text-teal-200/80 leading-relaxed">
            AI-Powered Heart Disease Detection & Prediction
          </p>
          <p className="text-sm text-teal-300/50 mt-4">
            Real-time PCG & ECG analysis using heart sounds and machine learning
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-3 justify-center mt-10">
            {['Heart Sound Analysis', 'ML Inference', 'ECG/PCG', 'IoT Devices'].map((feature) => (
              <span key={feature} className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-teal-200/80 border border-white/10 backdrop-blur-sm">
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right side — Form */}
      <div className="flex-1 flex items-center justify-center bg-background px-4 sm:px-6 lg:px-8">
        <div className="max-w-sm w-full space-y-8">
          {/* Mobile logo */}
          <div className="text-center lg:hidden">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg">
                <Heart className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-2xl font-bold text-foreground tracking-tight">SONOCARDIA</span>
            </div>
            <p className="text-sm text-muted-foreground">AI-Powered Heart Disease Detection</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {getTitle()}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {getSubtitle()}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 fade-in">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {message && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-4 fade-in">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name — only for sign up */}
            {isSignUp && (
              <div className="fade-in">
                <label htmlFor="fullName" className="block text-sm font-medium text-foreground mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full gap-2"
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

            <div className="text-center space-y-2">
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
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  {isSignUp
                    ? 'Already have an account? Sign in'
                    : "Don't have an account? Sign up"
                  }
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
