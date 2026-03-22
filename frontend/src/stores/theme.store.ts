import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'dark' | 'light' | 'system'

interface ThemeState {
  mode: ThemeMode
  resolvedTheme: 'dark' | 'light'
}

interface ThemeActions {
  setMode: (mode: ThemeMode) => void
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return mode
}

function applyTheme(resolved: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export const useThemeStore = create<ThemeState & ThemeActions>()(
  persist(
    (set) => ({
      mode: 'dark',
      resolvedTheme: 'dark',

      setMode: (mode) => {
        const resolved = resolveTheme(mode)
        applyTheme(resolved)
        set({ mode, resolvedTheme: resolved })
      },
    }),
    {
      name: 'opm-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = resolveTheme(state.mode)
          applyTheme(resolved)
          state.resolvedTheme = resolved
        }
      },
    },
  ),
)
