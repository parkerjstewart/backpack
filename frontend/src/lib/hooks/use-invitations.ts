import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { invitationsApi } from '@/lib/api/invitations'
import { COURSE_QUERY_KEYS } from '@/lib/hooks/use-courses'
import { useAuthStore } from '@/lib/stores/auth-store'
import type {
  InvitationResponse,
  CreateInvitationRequest,
} from '@/lib/types/api'

// ============================================
// Query Keys
// ============================================
export const INVITATION_QUERY_KEYS = {
  all: ['invitations'] as const,
  myPending: () => [...INVITATION_QUERY_KEYS.all, 'my-pending'] as const,
  forCourse: (courseId: string) =>
    [...INVITATION_QUERY_KEYS.all, 'course', courseId] as const,
}

// ============================================
// Query Hooks
// ============================================

/**
 * Hook to fetch pending invitations for the current user.
 * Only enabled when the user is authenticated.
 */
export function useMyPendingInvitations() {
  const { isAuthenticated, currentUser } = useAuthStore()

  return useQuery<InvitationResponse[]>({
    queryKey: INVITATION_QUERY_KEYS.myPending(),
    queryFn: () => invitationsApi.getMyPending(),
    enabled: isAuthenticated && !!currentUser,
  })
}

/**
 * Hook to fetch pending invitations for a course (instructor view).
 */
export function useCourseInvitations(
  courseId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery<InvitationResponse[]>({
    queryKey: INVITATION_QUERY_KEYS.forCourse(courseId ?? ''),
    queryFn: () => invitationsApi.getCourseInvitations(courseId!),
    enabled: !!courseId && (options?.enabled ?? true),
  })
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Hook to create an invitation for a course.
 * Replaces useAddCourseMember in InviteDialog.
 */
export function useCreateInvitation(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation<InvitationResponse, Error, CreateInvitationRequest>({
    mutationFn: (data) => invitationsApi.createInvite(courseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: INVITATION_QUERY_KEYS.forCourse(courseId),
      })
      queryClient.invalidateQueries({
        queryKey: COURSE_QUERY_KEYS.students(courseId),
      })
      queryClient.invalidateQueries({
        queryKey: COURSE_QUERY_KEYS.detail(courseId),
      })
      toast.success(`Invited ${variables.name} to the course`)
    },
    onError: (error) => {
      toast.error(`Failed to send invitation: ${error.message}`)
    },
  })
}

/**
 * Hook to accept a pending invitation.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient()

  return useMutation<{ status: string; message: string }, Error, string>({
    mutationFn: (invitationId) => invitationsApi.accept(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: INVITATION_QUERY_KEYS.myPending(),
      })
      queryClient.invalidateQueries({ queryKey: COURSE_QUERY_KEYS.lists() })
      toast.success('Invitation accepted! You have been added to the course.')
    },
    onError: (error) => {
      toast.error(`Failed to accept invitation: ${error.message}`)
    },
  })
}

/**
 * Hook to decline a pending invitation.
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient()

  return useMutation<{ status: string; message: string }, Error, string>({
    mutationFn: (invitationId) => invitationsApi.decline(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: INVITATION_QUERY_KEYS.myPending(),
      })
      toast.success('Invitation declined')
    },
    onError: (error) => {
      toast.error(`Failed to decline invitation: ${error.message}`)
    },
  })
}

/**
 * Hook to cancel a pending invitation (instructor action).
 */
export function useCancelInvitation(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation<{ status: string; message: string }, Error, string>({
    mutationFn: (invitationId) => invitationsApi.cancel(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: INVITATION_QUERY_KEYS.forCourse(courseId),
      })
      queryClient.invalidateQueries({
        queryKey: COURSE_QUERY_KEYS.students(courseId),
      })
      toast.success('Invitation cancelled')
    },
    onError: (error) => {
      toast.error(`Failed to cancel invitation: ${error.message}`)
    },
  })
}
