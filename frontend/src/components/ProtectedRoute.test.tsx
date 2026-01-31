import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import * as AuthContext from '../context/AuthContext'

// Mock the useAuth hook
vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual('../context/AuthContext')
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

const mockUseAuth = vi.mocked(AuthContext.useAuth)

function renderWithRouter(initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show loading state while auth is loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      updateThemePreference: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByText('Checking session')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('should redirect to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      updateThemePreference: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('should render children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        email: 'user@example.com',
        role: 'viewer',
        theme_preference: 'system',
      },
      token: 'valid-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      updateThemePreference: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('should render children when authenticated as admin', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        email: 'admin@example.com',
        role: 'admin',
        theme_preference: 'dark',
      },
      token: 'admin-token',
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      updateThemePreference: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('should have proper styling for loading state', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      updateThemePreference: vi.fn(),
    })

    const { container } = renderWithRouter()

    // Check that the loading container has the expected flex centering classes
    const loadingContainer = container.querySelector('.flex.min-h-screen.items-center')
    expect(loadingContainer).toBeInTheDocument()
  })
})
