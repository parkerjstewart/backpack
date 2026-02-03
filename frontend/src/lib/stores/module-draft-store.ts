import { create } from 'zustand'

export type SourceStatus = 'processing' | 'completed' | 'failed'

export interface DraftLearningGoal {
  description: string
  order: number
}

interface ModuleDraftState {
  // Sources being processed (not yet linked to module)
  pendingSourceIds: string[]
  sourceStatuses: Record<string, SourceStatus>
  
  // Module fields
  name: string
  description: string
  overview: string | null
  learningGoals: DraftLearningGoal[]
  dueDate: string | null
  prerequisites: string | null
  
  // Course assignment (for when creating from course page)
  targetCourseId: string | null
  
  // Track if content has been generated
  hasGeneratedContent: boolean
  
  // Actions
  addPendingSource: (sourceId: string) => void
  removePendingSource: (sourceId: string) => void
  updateSourceStatus: (sourceId: string, status: SourceStatus) => void
  setModuleField: <K extends keyof ModuleDraftFields>(field: K, value: ModuleDraftFields[K]) => void
  setGeneratedContent: (overview: string | null, learningGoals: DraftLearningGoal[]) => void
  addLearningGoal: (description: string) => void
  updateLearningGoal: (index: number, description: string) => void
  removeLearningGoal: (index: number) => void
  setTargetCourseId: (courseId: string | null) => void
  reset: () => void
  
  // Computed getters
  getPendingSourceIds: () => string[]
  getAllSourcesComplete: () => boolean
  getCompletedCount: () => number
  getFailedCount: () => number
}

// Helper type for module fields that can be set
type ModuleDraftFields = {
  name: string
  description: string
  overview: string | null
  dueDate: string | null
  prerequisites: string | null
}

const initialState = {
  pendingSourceIds: [],
  sourceStatuses: {},
  name: '',
  description: '',
  overview: null,
  learningGoals: [],
  dueDate: null,
  prerequisites: null,
  targetCourseId: null,
  hasGeneratedContent: false,
}

export const useModuleDraftStore = create<ModuleDraftState>()((set, get) => ({
  ...initialState,

  addPendingSource: (sourceId: string) => {
    set((state) => ({
      pendingSourceIds: [...state.pendingSourceIds, sourceId],
      sourceStatuses: {
        ...state.sourceStatuses,
        [sourceId]: 'processing',
      },
    }))
  },

  removePendingSource: (sourceId: string) => {
    set((state) => {
      const newSourceStatuses = { ...state.sourceStatuses }
      delete newSourceStatuses[sourceId]
      return {
        pendingSourceIds: state.pendingSourceIds.filter((id) => id !== sourceId),
        sourceStatuses: newSourceStatuses,
      }
    })
  },

  updateSourceStatus: (sourceId: string, status: SourceStatus) => {
    set((state) => ({
      sourceStatuses: {
        ...state.sourceStatuses,
        [sourceId]: status,
      },
    }))
  },

  setModuleField: (field, value) => {
    set({ [field]: value })
  },

  setGeneratedContent: (overview: string | null, learningGoals: DraftLearningGoal[]) => {
    set({
      overview,
      learningGoals,
      hasGeneratedContent: true,
    })
  },

  addLearningGoal: (description: string) => {
    set((state) => ({
      learningGoals: [
        ...state.learningGoals,
        { description, order: state.learningGoals.length },
      ],
    }))
  },

  updateLearningGoal: (index: number, description: string) => {
    set((state) => ({
      learningGoals: state.learningGoals.map((goal, i) =>
        i === index ? { ...goal, description } : goal
      ),
    }))
  },

  removeLearningGoal: (index: number) => {
    set((state) => ({
      learningGoals: state.learningGoals
        .filter((_, i) => i !== index)
        .map((goal, i) => ({ ...goal, order: i })),
    }))
  },

  setTargetCourseId: (courseId: string | null) => {
    set({ targetCourseId: courseId })
  },

  reset: () => {
    set(initialState)
  },

  getPendingSourceIds: () => {
    return get().pendingSourceIds
  },

  getAllSourcesComplete: () => {
    const { pendingSourceIds, sourceStatuses } = get()
    if (pendingSourceIds.length === 0) return false
    return pendingSourceIds.every(
      (id) => sourceStatuses[id] === 'completed' || sourceStatuses[id] === 'failed'
    )
  },

  getCompletedCount: () => {
    const { pendingSourceIds, sourceStatuses } = get()
    return pendingSourceIds.filter((id) => sourceStatuses[id] === 'completed').length
  },

  getFailedCount: () => {
    const { pendingSourceIds, sourceStatuses } = get()
    return pendingSourceIds.filter((id) => sourceStatuses[id] === 'failed').length
  },
}))
