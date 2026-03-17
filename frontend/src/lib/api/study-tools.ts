import apiClient from './client'

export interface Flashcard {
  question: string
  answer: string
}

export interface FlashcardsData {
  cards: Flashcard[]
}

export interface QuizOption {
  letter: string
  text: string
}

export interface QuizQuestion {
  question: string
  options: QuizOption[]
  correct_answer: string
  explanation: string
}

export interface QuizData {
  questions: QuizQuestion[]
}

export interface MindMapNode {
  label: string
  children: MindMapNode[]
}

export interface MindMapData {
  title: string
  root: MindMapNode
}

export interface PodcastStudyToolData {
  episode_id?: string
  audio_file?: string
  audio_url?: string
}

export interface StudyToolResultResponse {
  id: string
  module_id: string
  tool_type: 'flashcards' | 'quiz' | 'mind_map' | 'podcast'
  title: string
  data: FlashcardsData | QuizData | MindMapData | PodcastStudyToolData
  status: 'generating' | 'completed' | 'failed'
  created: string
  updated: string
}

export interface PodcastStudyToolRequest {
  episode_profile?: string
  speaker_profile?: string
  episode_name?: string
  briefing_suffix?: string | null
}

export const studyToolsApi = {
  generateFlashcards: async (moduleId: string): Promise<StudyToolResultResponse> => {
    const response = await apiClient.post<StudyToolResultResponse>(
      `/modules/${moduleId}/study-tools/flashcards`
    )
    return response.data
  },

  generateQuiz: async (moduleId: string): Promise<StudyToolResultResponse> => {
    const response = await apiClient.post<StudyToolResultResponse>(
      `/modules/${moduleId}/study-tools/quiz`
    )
    return response.data
  },

  generateMindMap: async (moduleId: string): Promise<StudyToolResultResponse> => {
    const response = await apiClient.post<StudyToolResultResponse>(
      `/modules/${moduleId}/study-tools/mind-map`
    )
    return response.data
  },

  generatePodcast: async (moduleId: string, body: PodcastStudyToolRequest): Promise<StudyToolResultResponse> => {
    const response = await apiClient.post<StudyToolResultResponse>(
      `/modules/${moduleId}/study-tools/podcast`,
      body
    )
    return response.data
  },

  listResults: async (moduleId: string): Promise<StudyToolResultResponse[]> => {
    const response = await apiClient.get<StudyToolResultResponse[]>(
      `/modules/${moduleId}/study-tools`
    )
    return response.data
  },

  renameResult: async (resultId: string, title: string): Promise<StudyToolResultResponse> => {
    const response = await apiClient.patch<StudyToolResultResponse>(
      `/study-tools/${resultId}`,
      { title }
    )
    return response.data
  },

  deleteResult: async (resultId: string): Promise<void> => {
    await apiClient.delete(`/study-tools/${resultId}`)
  },
}
