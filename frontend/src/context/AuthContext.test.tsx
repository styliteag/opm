import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { ThemeProvider } from './ThemeContext'

// Test component that uses the hook
function TestComponent({ onError }: { onError?: (e: Error) => void }) {
  const { user, token, loading, login, logout } = useAuth()

  const handleLogin = async () => {
    try {
      await login('test@example.com', 'password123')
    } catch (e) {
      onError?.(e as Error)
    }
  }

  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="role">{user?.role ?? 'none'}</span>
      <button onClick={handleLogin}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  )
}

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ThemeProvider>
  )
}

describe('AuthContext', () => {
  const originalFetch = global.fetch
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.localStorage.removeItem('opm-auth-token')
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('should throw error when useAuth is used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useAuth must be used within AuthProvider')

    consoleSpy.mockRestore()
  })

  it('should finish loading when no stored token', async () => {
    renderWithProviders(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready')
    })

    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('should fetch user when stored token exists', async () => {
    window.localStorage.setItem('opm-auth-token', 'stored-token')

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 1,
          email: 'user@example.com',
          role: 'admin',
          theme_preference: 'dark',
        }),
    })

    renderWithProviders(<TestComponent />)

    // Should call API to fetch current user
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({
          headers: { Authorization: 'Bearer stored-token' },
        })
      )
    })
  })

  it('should clear token when stored token is invalid', async () => {
    window.localStorage.setItem('opm-auth-token', 'invalid-token')

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ detail: 'Invalid token' }),
    })

    renderWithProviders(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready')
    })

    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(screen.getByTestId('token').textContent).toBe('none')
    expect(window.localStorage.getItem('opm-auth-token')).toBeNull()
  })

  describe('login', () => {
    it('should login successfully and store token', async () => {
      // First call: login endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'new-token' }),
      })

      // Second call: fetch current user
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 1,
            email: 'test@example.com',
            role: 'viewer',
            theme_preference: 'system',
          }),
      })

      renderWithProviders(<TestComponent />)

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('ready')
      })

      await act(async () => {
        screen.getByText('Login').click()
      })

      // Should call login and then fetch user endpoints
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/auth/login',
          expect.objectContaining({ method: 'POST' })
        )
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/auth/me',
          expect.objectContaining({
            headers: { Authorization: 'Bearer new-token' },
          })
        )
      })
    })

    it('should call onError when login fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ detail: 'Invalid credentials' }),
      })

      const onError = vi.fn()
      renderWithProviders(<TestComponent onError={onError} />)

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('ready')
      })

      await act(async () => {
        screen.getByText('Login').click()
      })

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(Error))
      })

      expect(onError.mock.calls[0][0].message).toBe('Invalid credentials')
    })

    it('should send correct login request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'token' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 1,
            email: 'test@example.com',
            role: 'viewer',
            theme_preference: 'system',
          }),
      })

      renderWithProviders(<TestComponent />)

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('ready')
      })

      await act(async () => {
        screen.getByText('Login').click()
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/auth/login',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
          })
        )
      })
    })
  })

  describe('logout', () => {
    it('should clear local state immediately', async () => {
      window.localStorage.setItem('opm-auth-token', 'token')

      // First call: fetch user
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 1,
            email: 'user@example.com',
            role: 'admin',
            theme_preference: 'dark',
          }),
      })

      // Logout endpoint
      mockFetch.mockResolvedValueOnce({ ok: true })

      renderWithProviders(<TestComponent />)

      await waitFor(
        () => {
          expect(screen.getByTestId('user').textContent).toBe('user@example.com')
        },
        { timeout: 3000 }
      )

      await act(async () => {
        screen.getByText('Logout').click()
      })

      expect(screen.getByTestId('user').textContent).toBe('none')
      expect(screen.getByTestId('token').textContent).toBe('none')
      expect(window.localStorage.getItem('opm-auth-token')).toBeNull()
    })

    it('should not throw on logout network error', async () => {
      window.localStorage.setItem('opm-auth-token', 'token')

      // First call: fetch user
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 1,
            email: 'user@example.com',
            role: 'admin',
            theme_preference: 'dark',
          }),
      })

      // Logout endpoint fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<TestComponent />)

      await waitFor(
        () => {
          expect(screen.getByTestId('user').textContent).toBe('user@example.com')
        },
        { timeout: 3000 }
      )

      // Should not throw
      await act(async () => {
        screen.getByText('Logout').click()
      })

      // Local state should still be cleared
      expect(screen.getByTestId('user').textContent).toBe('none')
    })

    it('should do nothing when no token', async () => {
      renderWithProviders(<TestComponent />)

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('ready')
      })

      await act(async () => {
        screen.getByText('Logout').click()
      })

      // Should not call fetch for logout when no token
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should extract string error detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ detail: 'Email already exists' }),
      })

      const onError = vi.fn()
      renderWithProviders(<TestComponent onError={onError} />)

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('ready')
      })

      await act(async () => {
        screen.getByText('Login').click()
      })

      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError.mock.calls[0][0].message).toBe('Email already exists')
    })

    it('should extract FastAPI validation errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: () =>
          Promise.resolve({
            detail: [
              { loc: ['body', 'email'], msg: 'invalid email', type: 'value_error' },
              { loc: ['body', 'password'], msg: 'too short', type: 'value_error' },
            ],
          }),
      })

      const onError = vi.fn()
      renderWithProviders(<TestComponent onError={onError} />)

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('ready')
      })

      await act(async () => {
        screen.getByText('Login').click()
      })

      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError.mock.calls[0][0].message).toContain('email: invalid email')
      expect(onError.mock.calls[0][0].message).toContain('password: too short')
    })

    it('should fall back to status text when JSON parsing fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      })

      const onError = vi.fn()
      renderWithProviders(<TestComponent onError={onError} />)

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('ready')
      })

      await act(async () => {
        screen.getByText('Login').click()
      })

      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError.mock.calls[0][0].message).toBe('Internal Server Error')
    })
  })
})
