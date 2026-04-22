import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'admin' | 'operator' | 'analyst' | 'viewer'
export type ThemePreference = 'light' | 'dark' | 'system'

export interface User {
  id: number
  email: string
  role: UserRole
  theme_preference: ThemePreference
  totp_enabled?: boolean
  backup_codes_remaining?: number
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

interface AuthActions {
  login: (token: string, user: User) => void
  logout: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (token, user) =>
        set({ token, user, isAuthenticated: true }),

      logout: () =>
        set({ token: null, user: null, isAuthenticated: false }),

      setUser: (user) =>
        set({ user }),
    }),
    {
      name: 'opm-auth-token',
      partialize: (state) => ({ token: state.token }),
    },
  ),
)
