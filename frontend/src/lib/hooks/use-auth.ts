'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function useAuth() {
  const router = useRouter()
  const {
    isAuthenticated,
    isLoading,
    logout,
    checkAuth,
    error,
    hasHydrated
  } = useAuthStore()

  useEffect(() => {
    // Only check auth after the store has hydrated from localStorage
    if (hasHydrated) {
      checkAuth()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return {
    isAuthenticated,
    isLoading: isLoading || !hasHydrated, // Treat lack of hydration as loading
    error,
    logout: handleLogout
  }
}
