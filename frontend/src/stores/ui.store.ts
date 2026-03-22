import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  sidebarCollapsed: boolean
  quickScanModalOpen: boolean
}

interface UiActions {
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openQuickScan: () => void
  closeQuickScan: () => void
}

export const useUiStore = create<UiState & UiActions>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      quickScanModalOpen: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      openQuickScan: () =>
        set({ quickScanModalOpen: true }),

      closeQuickScan: () =>
        set({ quickScanModalOpen: false }),
    }),
    {
      name: 'opm-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
