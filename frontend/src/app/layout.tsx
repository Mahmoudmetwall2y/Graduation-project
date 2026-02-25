import './globals.css'
import type { Metadata } from 'next'
import Navbar from './components/Navbar'
import { ThemeProvider } from './components/ThemeProvider'
import { ToastProvider } from './components/Toast'

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
        <ThemeProvider>
          <ToastProvider>
            <div className="app-shell">
              <Navbar />
              <main className="app-main">
                {children}
              </main>
            </div>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
