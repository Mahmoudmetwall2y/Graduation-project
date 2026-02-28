'use client'

import { useEffect, useState } from 'react'

/**
 * ThemeProvider — Light-only mode for Tablet UI Redesign.
 * Always ensures the `dark` class is removed from <html>.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        // Ensure light mode
        document.documentElement.classList.remove('dark')
    }, [])

    // Prevent flash
    if (!mounted) return <>{children}</>

    return <>{children}</>
}

// Re-export for compatibility
export const useTheme = () => ({
    theme: 'light' as const,
    toggleTheme: () => { /* no-op: light-only mode */ },
})
