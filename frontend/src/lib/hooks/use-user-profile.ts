import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { usersApi } from '@/lib/api/users'
import { useAuthStore } from '@/lib/stores/auth-store'
import type { UserResponse } from '@/lib/types/api'

/**
 * Hook to update the current user's profile (name and/or avatar).
 * After a successful update, refreshes the auth store's currentUser.
 */
export function useUpdateProfile() {
  const { setCurrentUser } = useAuthStore()

  return useMutation<UserResponse, Error, { name?: string; avatar?: File }>({
    mutationFn: (data) => usersApi.updateProfile(data),
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser)
      toast.success('Profile updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update profile')
    },
  })
}
