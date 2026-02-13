import apiClient from './client'
import {
  TutorSessionResponse,
  TutorResponsePayload,
  TutorSessionStateResponse,
} from '@/lib/types/api'

export const tutorApi = {
  // Create a new tutor session for a module
  createSession: async (moduleId: string) => {
    const response = await apiClient.post<TutorSessionResponse>(
      `/tutor/sessions`,
      { module_id: moduleId }
    )
    return response.data
  },

  // Get current session state
  getSession: async (sessionId: string) => {
    const response = await apiClient.get<TutorSessionStateResponse>(
      `/tutor/sessions/${sessionId}`
    )
    return response.data
  },

  // Send student response and get tutor reply
  sendResponse: async (sessionId: string, message: string) => {
    const response = await apiClient.post<TutorResponsePayload>(
      `/tutor/sessions/${sessionId}/respond`,
      { message }
    )
    return response.data
  },
}

export default tutorApi
