import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { studyToolsApi, PodcastStudyToolRequest } from '@/lib/api/study-tools'
import { QUERY_KEYS } from '@/lib/api/query-client'

export function useStudyToolResults(moduleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.studyToolResults(moduleId),
    queryFn: () => studyToolsApi.listResults(moduleId),
    enabled: !!moduleId,
    // Poll every 3s while any result is still generating
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const hasGenerating = data.some((r) => r.status === 'generating')
      return hasGenerating ? 3000 : false
    },
  })
}

export function useGenerateFlashcards() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (moduleId: string) => studyToolsApi.generateFlashcards(moduleId),
    onSuccess: (_, moduleId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.studyToolResults(moduleId) })
    },
  })
}

export function useGenerateQuiz() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (moduleId: string) => studyToolsApi.generateQuiz(moduleId),
    onSuccess: (_, moduleId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.studyToolResults(moduleId) })
    },
  })
}

export function useGenerateMindMap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (moduleId: string) => studyToolsApi.generateMindMap(moduleId),
    onSuccess: (_, moduleId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.studyToolResults(moduleId) })
    },
  })
}

export function useGeneratePodcastStudyTool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ moduleId, body }: { moduleId: string; body: PodcastStudyToolRequest }) =>
      studyToolsApi.generatePodcast(moduleId, body),
    onSuccess: (_, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.studyToolResults(moduleId) })
    },
  })
}

export function useRenameStudyToolResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ resultId, title }: { resultId: string; moduleId: string; title: string }) =>
      studyToolsApi.renameResult(resultId, title),
    onSuccess: (_, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.studyToolResults(moduleId) })
    },
  })
}

export function useDeleteStudyToolResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ resultId }: { resultId: string; moduleId: string }) =>
      studyToolsApi.deleteResult(resultId),
    onSuccess: (_, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.studyToolResults(moduleId) })
    },
  })
}
