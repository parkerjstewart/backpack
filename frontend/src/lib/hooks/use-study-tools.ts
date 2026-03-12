import { useMutation } from '@tanstack/react-query'

import { studyToolsApi } from '@/lib/api/study-tools'

export function useGenerateFlashcards() {
  return useMutation({
    mutationFn: (moduleId: string) => studyToolsApi.generateFlashcards(moduleId),
  })
}

export function useGenerateQuiz() {
  return useMutation({
    mutationFn: (moduleId: string) => studyToolsApi.generateQuiz(moduleId),
  })
}

export function useGenerateKeyConcepts() {
  return useMutation({
    mutationFn: (moduleId: string) => studyToolsApi.generateKeyConcepts(moduleId),
  })
}
