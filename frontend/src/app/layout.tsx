import './globals.css'
import type { Metadata } from 'next'
import Navbar from './components/Navbar'
import { ThemeProvider } from './components/ThemeProvider'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/error-boundary'
import ChatBot from './components/ChatBot'

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
              <div className="app-shell">
                <div className="app-container">
                  <Navbar />
                  <main className="app-main">
                    {children}
                  </main>
                  <ChatBot />
                </div>
              </div>
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
