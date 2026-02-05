import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { coursesApi } from '@/lib/api/courses'
import type {
  CourseResponse,
  CreateCourseRequest,
  UpdateCourseRequest,
  AddCourseMemberRequest,
  CourseMemberResponse,
  StudentWithMasteryResponse,
} from '@/lib/types/api'

// ============================================
// Query Keys
// ============================================
export const COURSE_QUERY_KEYS = {
  all: ['courses'] as const,
  lists: () => [...COURSE_QUERY_KEYS.all, 'list'] as const,
  list: (params?: { archived?: boolean }) =>
    [...COURSE_QUERY_KEYS.lists(), params] as const,
  details: () => [...COURSE_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...COURSE_QUERY_KEYS.details(), id] as const,
  students: (courseId: string) =>
    [...COURSE_QUERY_KEYS.detail(courseId), 'students'] as const,
  teachingTeam: (courseId: string) =>
    [...COURSE_QUERY_KEYS.detail(courseId), 'teaching-team'] as const,
  needsAttention: (courseId: string) =>
    [...COURSE_QUERY_KEYS.detail(courseId), 'needs-attention'] as const,
}

// ============================================
// Query Hooks
// ============================================

/**
 * Hook to fetch all courses.
 */
export function useCourses(params?: { archived?: boolean }) {
  return useQuery<CourseResponse[]>({
    queryKey: COURSE_QUERY_KEYS.list(params),
    queryFn: () => coursesApi.list(params),
  })
}

/**
 * Hook to fetch a single course.
 */
export function useCourse(courseId: string | undefined) {
  return useQuery<CourseResponse>({
    queryKey: COURSE_QUERY_KEYS.detail(courseId ?? ''),
    queryFn: () => coursesApi.get(courseId!),
    enabled: !!courseId,
  })
}

/**
 * Hook to fetch students in a course with mastery.
 */
export function useCourseStudents(courseId: string | undefined) {
  return useQuery<StudentWithMasteryResponse[]>({
    queryKey: COURSE_QUERY_KEYS.students(courseId ?? ''),
    queryFn: () => coursesApi.getStudents(courseId!),
    enabled: !!courseId,
  })
}

/**
 * Hook to fetch teaching team for a course.
 */
export function useCourseTeachingTeam(courseId: string | undefined) {
  return useQuery<CourseMemberResponse[]>({
    queryKey: COURSE_QUERY_KEYS.teachingTeam(courseId ?? ''),
    queryFn: () => coursesApi.getTeachingTeam(courseId!),
    enabled: !!courseId,
  })
}

/**
 * Hook to fetch students needing attention.
 */
export function useCourseNeedsAttention(courseId: string | undefined) {
  return useQuery<CourseMemberResponse[]>({
    queryKey: COURSE_QUERY_KEYS.needsAttention(courseId ?? ''),
    queryFn: () => coursesApi.getNeedsAttention(courseId!),
    enabled: !!courseId,
  })
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Hook to create a new course.
 */
export function useCreateCourse() {
  const queryClient = useQueryClient()

  return useMutation<CourseResponse, Error, CreateCourseRequest>({
    mutationFn: (data) => coursesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.lists() })
      toast.success('Course created successfully')
    },
    onError: (error) => {
      toast.error(`Failed to create course: ${error.message}`)
    },
  })
}

/**
 * Hook to update a course.
 */
export function useUpdateCourse(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation<CourseResponse, Error, UpdateCourseRequest>({
    mutationFn: (data) => coursesApi.update(courseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.detail(courseId) })
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.lists() })
      toast.success('Course updated successfully')
    },
    onError: (error) => {
      toast.error(`Failed to update course: ${error.message}`)
    },
  })
}

/**
 * Hook to delete a course.
 */
export function useDeleteCourse() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (courseId) => coursesApi.delete(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.lists() })
      toast.success('Course deleted successfully')
    },
    onError: (error) => {
      toast.error(`Failed to delete course: ${error.message}`)
    },
  })
}

/**
 * Hook to add a member to a course.
 */
export function useAddCourseMember(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation<CourseMemberResponse, Error, AddCourseMemberRequest>({
    mutationFn: (data) => coursesApi.addMember(courseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.students(courseId) })
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.teachingTeam(courseId) })
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.detail(courseId) })
      toast.success(`Added ${variables.email} to the course`)
    },
    onError: (error) => {
      toast.error(`Failed to add member: ${error.message}`)
    },
  })
}

/**
 * Hook to remove a member from a course.
 */
export function useRemoveCourseMember(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (userId) => coursesApi.removeMember(courseId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.students(courseId) })
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.teachingTeam(courseId) })
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.detail(courseId) })
      toast.success('Member removed from course')
    },
    onError: (error) => {
      toast.error(`Failed to remove member: ${error.message}`)
    },
  })
}
