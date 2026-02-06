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
  authRequired: boolean | null
  setHasHydrated: (state: boolean) => void
  setCurrentUser: (user: UserResponse | null) => void
  checkAuthRequired: () => Promise<boolean>
  login: (password: string) => Promise<boolean>
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
      authRequired: null,

      setHasHydrated: (state: boolean) => {
        set({ hasHydrated: state })
      },

      setCurrentUser: (user: UserResponse | null) => {
        set({ currentUser: user })
      },

      checkAuthRequired: async () => {
        try {
          const apiUrl = await getApiUrl()
          const response = await fetch(`${apiUrl}/api/auth/status`, {
            cache: 'no-store',
          })

          if (!response.ok) {
            throw new Error(`Auth status check failed: ${response.status}`)
          }

          const data = await response.json()
          const required = data.auth_enabled || false
          set({ authRequired: required })

          // If auth is not required, mark as authenticated
          if (!required) {
            set({ isAuthenticated: true, token: 'not-required' })
          }

          return required
        } catch (error) {
          console.error('Failed to check auth status:', error)

          // If it's a network error, set a more helpful error message
          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            set({
              error: 'Unable to connect to server. Please check if the API is running.',
              authRequired: null  // Don't assume auth is required if we can't connect
            })
          } else {
            // For other errors, default to requiring auth to be safe
            set({ authRequired: true })
          }

          // Re-throw the error so the UI can handle it
          throw error
        }
      },

      login: async (password: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()

          // Test auth with modules endpoint
          const response = await fetch(`${apiUrl}/api/modules`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${password}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            set({ 
              isAuthenticated: true, 
              token: password, 
              isLoading: false,
              lastAuthCheck: Date.now(),
              error: null
            })
            return true
          } else {
            let errorMessage = 'Authentication failed'
            if (response.status === 401) {
              errorMessage = 'Invalid password. Please try again.'
            } else if (response.status === 403) {
              errorMessage = 'Access denied. Please check your credentials.'
            } else if (response.status >= 500) {
              errorMessage = 'Server error. Please try again later.'
            } else {
              errorMessage = `Authentication failed (${response.status})`
            }
            
            set({ 
              error: errorMessage,
              isLoading: false,
              isAuthenticated: false,
              token: null
            })
            return false
          }
        } catch (error) {
          console.error('Network error during auth:', error)
          let errorMessage = 'Authentication failed'
          
          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to server. Please check if the API is running.'
          } else if (error instanceof Error) {
            errorMessage = `Network error: ${error.message}`
          } else {
            errorMessage = 'An unexpected error occurred during authentication'
          }
          
          set({ 
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null
          })
          return false
        }
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

        // If no token, not authenticated
        if (!token) {
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

          const response = await fetch(`${apiUrl}/api/modules`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            set({ 
              isAuthenticated: true, 
              lastAuthCheck: now,
              isCheckingAuth: false 
            })
            return true
          } else {
            set({
              isAuthenticated: false,
              token: null,
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