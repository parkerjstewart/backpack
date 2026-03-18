import { useQuery } from '@tanstack/react-query'
import { tutorApi } from '@/lib/api/tutor'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type { StudentProgressResponse } from '@/lib/types/api'

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
