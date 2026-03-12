import apiClient from './client'

export interface StudyToolResponse {
  content: string
  module_id: string
}

export const studyToolsApi = {
  generateFlashcards: async (moduleId: string): Promise<StudyToolResponse> => {
    const response = await apiClient.post<StudyToolResponse>(
      `/modules/${moduleId}/study-tools/flashcards`
    )
    return response.data
  },

  generateQuiz: async (moduleId: string): Promise<StudyToolResponse> => {
    const response = await apiClient.post<StudyToolResponse>(
      `/modules/${moduleId}/study-tools/quiz`
    )
    return response.data
  },

  generateKeyConcepts: async (moduleId: string): Promise<StudyToolResponse> => {
    const response = await apiClient.post<StudyToolResponse>(
      `/modules/${moduleId}/study-tools/key-concepts`
    )
    return response.data
  },
}
