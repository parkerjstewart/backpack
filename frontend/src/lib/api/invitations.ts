import apiClient from './client'
import type {
  InvitationResponse,
  CreateInvitationRequest,
  EnrollmentRequestResponse,
} from '@/lib/types/api'

export const invitationsApi = {
  /**
   * Create a pending invitation for a user to join a course.
   */
  createInvite: async (
    courseId: string,
    data: CreateInvitationRequest
  ): Promise<InvitationResponse> => {
    const response = await apiClient.post<InvitationResponse>(
      `/courses/${courseId}/invite`,
      data
    )
    return response.data
  },

  /**
   * Get all pending invitations for the current user.
   */
  getMyPending: async (): Promise<InvitationResponse[]> => {
    const response = await apiClient.get<InvitationResponse[]>(
      '/users/me/invitations'
    )
    return response.data
  },

  /**
   * Accept a pending invitation.
   */
  accept: async (
    invitationId: string
  ): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post<{ status: string; message: string }>(
      `/invitations/${invitationId}/accept`
    )
    return response.data
  },

  /**
   * Decline a pending invitation.
   */
  decline: async (
    invitationId: string
  ): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post<{ status: string; message: string }>(
      `/invitations/${invitationId}/decline`
    )
    return response.data
  },

  /**
   * Get all pending invitations for a course (instructor view).
   */
  getCourseInvitations: async (
    courseId: string
  ): Promise<InvitationResponse[]> => {
    const response = await apiClient.get<InvitationResponse[]>(
      `/courses/${courseId}/invitations`
    )
    return response.data
  },

  /**
   * Cancel a pending invitation (instructor action).
   */
  cancel: async (
    invitationId: string
  ): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post<{ status: string; message: string }>(
      `/invitations/${invitationId}/cancel`
    )
    return response.data
  },

  // ============================================
  // Enrollment requests (student-initiated)
  // ============================================

  /**
   * Get pending enrollment requests for a course (teaching staff view).
   */
  getEnrollmentRequests: async (
    courseId: string
  ): Promise<EnrollmentRequestResponse[]> => {
    const response = await apiClient.get<EnrollmentRequestResponse[]>(
      `/courses/${encodeURIComponent(courseId)}/enrollment-requests`
    )
    return response.data
  },

  /**
   * Approve a student enrollment request (teaching staff action).
   */
  approveRequest: async (
    requestId: string
  ): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post<{ status: string; message: string }>(
      `/enrollment-requests/${requestId}/approve`
    )
    return response.data
  },

  /**
   * Deny a student enrollment request (teaching staff action).
   */
  denyRequest: async (
    requestId: string
  ): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post<{ status: string; message: string }>(
      `/enrollment-requests/${requestId}/deny`
    )
    return response.data
  },

  /**
   * Get all enrollment requests submitted by the current user.
   */
  getMyEnrollmentRequests: async (): Promise<EnrollmentRequestResponse[]> => {
    const response = await apiClient.get<EnrollmentRequestResponse[]>(
      '/users/me/enrollment-requests'
    )
    return response.data
  },
}

export default invitationsApi
