import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { studyToolsApi, PodcastStudyToolRequest } from '@/lib/api/study-tools'
import { QUERY_KEYS } from '@/lib/api/query-client'

const FRONTEND_GENERATING_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes

export function useStudyToolResults(moduleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.studyToolResults(moduleId),
    queryFn: () => studyToolsApi.listResults(moduleId),
    enabled: !!moduleId,
    retry: 1, // Surface errors quickly instead of retrying 3 times
    // Poll every 3s while any result is still generating
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const generating = data.filter((r) => r.status === 'generating')
      if (generating.length === 0) return false

      // Safety net: stop polling if all generating results are older than 20 minutes
      const now = Date.now()
      const allTimedOut = generating.every((r) => {
        if (!r.created) return false
        return now - new Date(r.created).getTime() > FRONTEND_GENERATING_TIMEOUT_MS
      })
      return allTimedOut ? false : 3000
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
