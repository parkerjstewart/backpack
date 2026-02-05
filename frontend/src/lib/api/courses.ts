import apiClient from './client'
import type {
  CourseResponse,
  CreateCourseRequest,
  UpdateCourseRequest,
  CourseMemberResponse,
  AddCourseMemberRequest,
  StudentWithMasteryResponse,
} from '@/lib/types/api'

export const coursesApi = {
  // ============================================
  // Course CRUD
  // ============================================

  /**
   * List all courses.
   * If user is authenticated, returns courses they're a member of.
   */
  list: async (params?: { archived?: boolean }): Promise<CourseResponse[]> => {
    const response = await apiClient.get<CourseResponse[]>('/courses', { params })
    return response.data
  },

  /**
   * Get a specific course by ID.
   */
  get: async (courseId: string): Promise<CourseResponse> => {
    const response = await apiClient.get<CourseResponse>(`/courses/${courseId}`)
    return response.data
  },

  /**
   * Create a new course.
   * Auto-enrolls the creator as instructor.
   */
  create: async (data: CreateCourseRequest): Promise<CourseResponse> => {
    const response = await apiClient.post<CourseResponse>('/courses', data)
    return response.data
  },

  /**
   * Update a course.
   */
  update: async (courseId: string, data: UpdateCourseRequest): Promise<CourseResponse> => {
    const response = await apiClient.put<CourseResponse>(`/courses/${courseId}`, data)
    return response.data
  },

  /**
   * Delete a course.
   */
  delete: async (courseId: string): Promise<void> => {
    await apiClient.delete(`/courses/${courseId}`)
  },

  // ============================================
  // Course Members
  // ============================================

  /**
   * Get all students in a course with their module mastery.
   */
  getStudents: async (courseId: string): Promise<StudentWithMasteryResponse[]> => {
    const response = await apiClient.get<StudentWithMasteryResponse[]>(
      `/courses/${courseId}/students`
    )
    return response.data
  },

  /**
   * Get all instructors and TAs for a course.
   */
  getTeachingTeam: async (courseId: string): Promise<CourseMemberResponse[]> => {
    const response = await apiClient.get<CourseMemberResponse[]>(
      `/courses/${courseId}/teaching-team`
    )
    return response.data
  },

  /**
   * Get students who need attention (struggling with learning goals).
   */
  getNeedsAttention: async (courseId: string): Promise<CourseMemberResponse[]> => {
    const response = await apiClient.get<CourseMemberResponse[]>(
      `/courses/${courseId}/needs-attention`
    )
    return response.data
  },

  /**
   * Add a member to a course by email.
   * Creates user if doesn't exist.
   */
  addMember: async (
    courseId: string,
    data: AddCourseMemberRequest
  ): Promise<CourseMemberResponse> => {
    const response = await apiClient.post<CourseMemberResponse>(
      `/courses/${courseId}/members`,
      data
    )
    return response.data
  },

  /**
   * Remove a member from a course.
   */
  removeMember: async (courseId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/courses/${courseId}/members/${userId}`)
  },
}

export default coursesApi
