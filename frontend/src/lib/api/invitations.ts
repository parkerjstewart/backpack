import apiClient from './client'
import type {
  InvitationResponse,
  CreateInvitationRequest,
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
}

export default invitationsApi
