import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tutorApi } from '@/lib/api/tutor'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type { StudentProgressResponse, ClassInsightsResponse } from '@/lib/types/api'

export function useStudentProgress(moduleId: string | undefined) {
  return useQuery<StudentProgressResponse[]>({
    queryKey: QUERY_KEYS.studentProgress(moduleId ?? ''),
    queryFn: () => tutorApi.getProgress(moduleId!),
    enabled: !!moduleId,
  })
}

export function useStudentProgressForStudent(
  moduleId: string | undefined,
  studentId: string | undefined
) {
  return useQuery<StudentProgressResponse[]>({
    queryKey: QUERY_KEYS.studentProgressForStudent(moduleId ?? '', studentId ?? ''),
    queryFn: () => tutorApi.getStudentProgress(moduleId!, studentId!),
    enabled: !!moduleId && !!studentId,
  })
}

export function useClassInsights(moduleId: string | undefined) {
  return useQuery<ClassInsightsResponse>({
    queryKey: QUERY_KEYS.classInsights(moduleId ?? ''),
    queryFn: () => tutorApi.getClassInsights(moduleId!),
    enabled: !!moduleId,
  })
}

export function useRegenerateClassInsights(moduleId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => tutorApi.regenerateClassInsights(moduleId!),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.classInsights(moduleId ?? ''),
        })
      }, 3000)
    },
  })
}
