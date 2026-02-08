import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Light mode only for now - dark mode temporarily disabled
export type Theme = 'light'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  getEffectiveTheme: () => 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      
      setTheme: (_theme: Theme) => {
        // Force light mode only
        set({ theme: 'light' })
        
        // Apply theme to document immediately
        if (typeof window !== 'undefined') {
          const root = window.document.documentElement
          root.classList.remove('light', 'dark')
          root.classList.add('light')
          root.setAttribute('data-theme', 'light')
        }
      },
      
      getEffectiveTheme: () => 'light'
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ theme: state.theme })
    }
  )
)

// Hook for components to use theme
export function useTheme() {
  const { theme, setTheme, getEffectiveTheme } = useThemeStore()
  
  return {
    theme,
    setTheme,
    effectiveTheme: getEffectiveTheme(),
    isDark: false
  }
}