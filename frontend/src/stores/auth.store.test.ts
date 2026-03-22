import { describe, it, expect, beforeEach } from 'vitest'

import { useAuthStore, type User } from './auth.store'

const mockUser: User = {
  id: 1,
  email: 'admin@example.com',
  role: 'admin',
  theme_preference: 'dark',
}

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
    })
  })

  it('starts unauthenticated', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
  })

  it('logs in with token and user', () => {
    useAuthStore.getState().login('test-token', mockUser)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('test-token')
    expect(state.user).toEqual(mockUser)
  })

  it('logs out and clears state', () => {
    useAuthStore.getState().login('test-token', mockUser)
    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
  })

  it('updates user without changing token', () => {
    useAuthStore.getState().login('test-token', mockUser)
    const updatedUser: User = { ...mockUser, role: 'viewer' }
    useAuthStore.getState().setUser(updatedUser)

    const state = useAuthStore.getState()
    expect(state.user?.role).toBe('viewer')
    expect(state.token).toBe('test-token')
  })

  it('preserves token in localStorage via persist', () => {
    useAuthStore.getState().login('persist-token', mockUser)
    const stored = JSON.parse(localStorage.getItem('opm-auth-token') ?? '{}')
    expect(stored.state?.token).toBe('persist-token')
  })

  it('does not persist user in localStorage (only token)', () => {
    useAuthStore.getState().login('test-token', mockUser)
    const stored = JSON.parse(localStorage.getItem('opm-auth-token') ?? '{}')
    expect(stored.state?.user).toBeUndefined()
  })

  it('supports all four roles', () => {
    for (const role of ['admin', 'operator', 'analyst', 'viewer'] as const) {
      const user: User = { ...mockUser, role }
      useAuthStore.getState().login('token', user)
      expect(useAuthStore.getState().user?.role).toBe(role)
    }
  })
})
