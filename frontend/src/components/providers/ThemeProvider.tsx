'use client'

import { useEffect } from 'react'

interface ThemeProviderProps {
  children: React.ReactNode
}

// Light mode only for now - dark mode temporarily disabled
export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    // Force light mode
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add('light')
    root.setAttribute('data-theme', 'light')
  }, [])

  return <>{children}</>
}
