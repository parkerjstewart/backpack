import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'instructor' | 'student'

interface ViewModeState {
  activeView: ViewMode
  setActiveView: (view: ViewMode) => void
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      activeView: 'instructor',

      setActiveView: (view: ViewMode) => {
        set({ activeView: view })
      },
    }),
    {
      name: 'view-mode-storage',
    }
  )
)
