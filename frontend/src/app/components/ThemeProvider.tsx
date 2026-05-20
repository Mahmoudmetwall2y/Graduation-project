'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
    theme: Theme
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'light',
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const saved = localStorage.getItem('theme') as Theme | null
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const initial = saved || (systemPrefersDark ? 'dark' : 'light')
        setTheme(initial)
        document.documentElement.classList.toggle('dark', initial === 'dark')
    }, [])

    

    // Prevent flash of wrong theme
    if (!mounted) return <>{children}</>

    return (
        <ThemeContext.Provider value={{ theme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => useContext(ThemeContext)
