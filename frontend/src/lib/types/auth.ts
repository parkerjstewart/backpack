export interface AuthState {
  isAuthenticated: boolean
  token: string | null
  isLoading: boolean
  error: string | null
}
