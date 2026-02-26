import apiClient from './client'
import {
  TutorSessionResponse,
  TutorResponsePayload,
  TutorSessionStateResponse,
  TutorDebugInfo,
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

  // Get internal agent debug state (tutor mode, student model, hypotheses, etc.)
  getDebugState: async (sessionId: string) => {
    const response = await apiClient.get<TutorDebugInfo>(
      `/tutor/sessions/${sessionId}/debug`
    )
    return response.data
  },
}

export default tutorApi
