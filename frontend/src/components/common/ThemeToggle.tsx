'use client'

// Theme toggle is temporarily hidden while in light-mode-only state
// Will be re-enabled when dark mode support is added back

interface ThemeToggleProps {
  iconOnly?: boolean
}

export function ThemeToggle({ iconOnly: _iconOnly = false }: ThemeToggleProps) {
  // Return null to hide the toggle - dark mode temporarily disabled
  return null
}