import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getApiUrl } from '@/lib/config'
import { queryClient } from '@/lib/api/query-client'
import type { UserResponse } from '@/lib/types/api'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  currentUser: UserResponse | null
  isLoading: boolean
  error: string | null
  lastAuthCheck: number | null
  isCheckingAuth: boolean
  hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
  setCurrentUser: (user: UserResponse | null) => void
  loginWithEmail: (email: string) => Promise<UserResponse | null>
  registerWithEmail: (email: string, name: string) => Promise<UserResponse | null>
  logout: () => void
  checkAuth: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      currentUser: null,
      isLoading: false,
      error: null,
      lastAuthCheck: null,
      isCheckingAuth: false,
      hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ hasHydrated: state })
      },

      setCurrentUser: (user: UserResponse | null) => {
        set({ currentUser: user })
      },

      logout: () => {
        set({
          isAuthenticated: false,
          token: null,
          currentUser: null,
          error: null
        })
        // Clear cached data from the previous user
        queryClient.clear()
      },

      loginWithEmail: async (email: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()

          const response = await fetch(`${apiUrl}/api/users/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
          })

          if (response.ok) {
            const user = await response.json()
            set({
              isAuthenticated: true,
              token: user.id,
              currentUser: user,
              isLoading: false,
              lastAuthCheck: Date.now(),
              error: null
            })
            return user
          } else {
            let errorMessage = 'Login failed'
            if (response.status === 404) {
              errorMessage = 'No account found with this email. Try signing up instead.'
            } else {
              errorMessage = `Login failed (${response.status})`
            }
            set({
              error: errorMessage,
              isLoading: false,
              isAuthenticated: false,
              token: null,
              currentUser: null
            })
            return null
          }
        } catch (error) {
          console.error('Network error during login:', error)
          const errorMessage = error instanceof TypeError && error.message.includes('Failed to fetch')
            ? 'Unable to connect to server. Please check if the API is running.'
            : 'An unexpected error occurred during login'

          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null,
            currentUser: null
          })
          return null
        }
      },

      registerWithEmail: async (email: string, name: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()

          const response = await fetch(`${apiUrl}/api/users/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, name })
          })

          if (response.ok) {
            const user = await response.json()
            set({
              isAuthenticated: true,
              token: user.id,
              currentUser: user,
              isLoading: false,
              lastAuthCheck: Date.now(),
              error: null
            })
            return user
          } else {
            let errorMessage = 'Registration failed'
            try {
              const data = await response.json()
              errorMessage = data.detail || errorMessage
            } catch {
              errorMessage = `Registration failed (${response.status})`
            }
            set({
              error: errorMessage,
              isLoading: false,
              isAuthenticated: false,
              token: null,
              currentUser: null
            })
            return null
          }
        } catch (error) {
          console.error('Network error during registration:', error)
          const errorMessage = error instanceof TypeError && error.message.includes('Failed to fetch')
            ? 'Unable to connect to server. Please check if the API is running.'
            : 'An unexpected error occurred during registration'

          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null,
            currentUser: null
          })
          return null
        }
      },
      
      checkAuth: async () => {
        const state = get()
        const { token, lastAuthCheck, isCheckingAuth, isAuthenticated } = state

        // If already checking, return current auth state
        if (isCheckingAuth) {
          return isAuthenticated
        }

        // If no token or invalid token format, not authenticated
        if (!token || !token.startsWith('user:')) {
          set({ isAuthenticated: false, token: null, currentUser: null })
          return false
        }

        // If we checked recently (within 30 seconds) and are authenticated, skip
        const now = Date.now()
        if (isAuthenticated && lastAuthCheck && (now - lastAuthCheck) < 30000) {
          return true
        }

        set({ isCheckingAuth: true })

        try {
          const apiUrl = await getApiUrl()

          const response = await fetch(`${apiUrl}/api/users/me`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            const user = await response.json()
            set({ 
              isAuthenticated: true, 
              currentUser: user,
              lastAuthCheck: now,
              isCheckingAuth: false 
            })
            return true
          } else {
            set({
              isAuthenticated: false,
              token: null,
              currentUser: null,
              lastAuthCheck: null,
              isCheckingAuth: false
            })
            return false
          }
        } catch (error) {
          console.error('checkAuth error:', error)
          set({ 
            isAuthenticated: false, 
            token: null,
            currentUser: null,
            lastAuthCheck: null,
            isCheckingAuth: false 
          })
          return false
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        currentUser: state.currentUser
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      }
    }
  )
)
