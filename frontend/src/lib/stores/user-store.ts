import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserProfile {
  name: string
  role: string
  avatarUrl?: string
}

interface UserState {
  profile: UserProfile
  hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
  updateProfile: (data: Partial<UserProfile>) => void
  setProfile: (profile: UserProfile) => void
}

const defaultProfile: UserProfile = {
  name: 'User',
  role: 'Student',
  avatarUrl: undefined,
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ hasHydrated: state })
      },

      updateProfile: (data: Partial<UserProfile>) => {
        set((state) => ({
          profile: {
            ...state.profile,
            ...data,
          },
        }))
      },

      setProfile: (profile: UserProfile) => {
        set({ profile })
      },
    }),
    {
      name: 'user-storage',
      partialize: (state) => ({
        profile: state.profile,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
