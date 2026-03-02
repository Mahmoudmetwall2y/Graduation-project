import './globals.css'
import type { Metadata } from 'next'
import { ThemeProvider } from './components/ThemeProvider'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/error-boundary'
import { TopBar } from '../components/layout/TopBar'

export const metadata: Metadata = {
  title: 'AscultiCor - AI-Powered Cardiac Auscultation',
  description: 'AI-powered cardiac auscultation and monitoring platform for real-time PCG and ECG analysis using heart sounds.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--hud-bg-base)' }}>
                <TopBar />
                <main className="flex-1 overflow-auto">
                  {children}
                </main>
              </div>
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
