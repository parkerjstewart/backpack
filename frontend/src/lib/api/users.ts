import apiClient from './client'
import type { UserResponse, UserLoginRequest, CourseResponse } from '@/lib/types/api'

export const usersApi = {
  /**
   * Login or register a user by email.
   * If the email exists, returns the existing user.
   * If not, creates a new user.
   */
  login: async (email: string): Promise<UserResponse> => {
    const request: UserLoginRequest = { email }
    const response = await apiClient.post<UserResponse>('/users/login', request)
    return response.data
  },

  /**
   * Get the current user's profile.
   * Requires authentication via user ID token.
   */
  getMe: async (): Promise<UserResponse> => {
    const response = await apiClient.get<UserResponse>('/users/me')
    return response.data
  },

  /**
   * Get courses for the current user.
   */
  getMyCourses: async (): Promise<CourseResponse[]> => {
    const response = await apiClient.get<CourseResponse[]>('/users/me/courses')
    return response.data
  },

  /**
   * Get a user by ID.
   */
  get: async (userId: string): Promise<UserResponse> => {
    const response = await apiClient.get<UserResponse>(`/users/${userId}`)
    return response.data
  },
}

export default usersApi
