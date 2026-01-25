import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTheme, type ThemePreference } from './ThemeContext'

type AuthRole = 'admin' | 'viewer'

type AuthUser = {
  id: number
  email: string
  role: AuthRole
  theme_preference: ThemePreference
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  updateThemePreference: (theme: ThemePreference) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const AUTH_TOKEN_KEY = 'opm-auth-token'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

const storeToken = (token: string | null) => {
  if (typeof window === 'undefined') {
    return
  }
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
  }
}

const getAuthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
})

const extractErrorMessage = async (response: Response) => {
  try {
    const data = await response.json()
    // Handle FastAPI validation errors (422)
    if (Array.isArray(data?.detail)) {
      const errors = data.detail.map((err: { msg?: string; loc?: unknown[]; type?: string }) => {
        const field = Array.isArray(err.loc) ? err.loc.slice(1).join('.') : 'field'
        return `${field}: ${err.msg || err.type || 'validation error'}`
      })
      return errors.join(', ')
    }
    if (typeof data?.detail === 'string') {
      return data.detail
    }
  } catch {
    // Ignore JSON parsing errors and fall back to status text.
  }
  return response.statusText || 'Request failed'
}

const fetchCurrentUser = async (token: string): Promise<AuthUser> => {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      ...getAuthHeaders(token),
    },
  })

  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(message)
  }

  return response.json()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    const storedToken = getStoredToken()
    if (!storedToken) {
      setLoading(false)
      setToken(null)
      setUser(null)
      return
    }

    setToken(storedToken)
    fetchCurrentUser(storedToken)
      .then((currentUser) => {
        setTheme(currentUser.theme_preference)
        setUser(currentUser)
      })
      .catch(() => {
        storeToken(null)
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [setTheme])

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        setLoading(false)
        throw new Error(message)
      }

      const data: { access_token: string } = await response.json()
      storeToken(data.access_token)
      setToken(data.access_token)

      try {
        const currentUser = await fetchCurrentUser(data.access_token)
        setTheme(currentUser.theme_preference)
        setUser(currentUser)
      } catch (error) {
        storeToken(null)
        setToken(null)
        setUser(null)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [setTheme],
  )

  const logout = useCallback(async () => {
    const activeToken = token
    storeToken(null)
    setToken(null)
    setUser(null)

    if (!activeToken) {
      return
    }

    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(activeToken),
        },
      })
    } catch {
      // Ignore logout network errors; token is cleared locally.
    }
  }, [token])

  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null)
      return
    }
    try {
      const currentUser = await fetchCurrentUser(token)
      setTheme(currentUser.theme_preference)
      setUser(currentUser)
    } catch {
      storeToken(null)
      setToken(null)
      setUser(null)
    }
  }, [token, setTheme])

  const updateThemePreference = useCallback(
    async (theme: ThemePreference) => {
      if (!token) {
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token),
        },
        body: JSON.stringify({ theme_preference: theme }),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      const updatedUser = (await response.json()) as AuthUser
      setTheme(updatedUser.theme_preference)
      setUser(updatedUser)
    },
    [token, setTheme],
  )

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      refreshUser,
      updateThemePreference,
    }),
    [user, token, loading, login, logout, refreshUser, updateThemePreference],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export type { AuthUser }
