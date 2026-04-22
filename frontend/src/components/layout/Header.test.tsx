import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => ({
    location: { pathname: '/alerts' },
  }),
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}))

import { Header } from './Header'

describe('Header', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 1, email: 'admin@test.com', role: 'admin', theme_preference: 'dark' },
      token: 'token',
      isAuthenticated: true,
    })
    useThemeStore.setState({ mode: 'dark', resolvedTheme: 'dark' })
  })

  it('renders breadcrumbs from pathname', () => {
    render(<Header />)
    expect(screen.getByText('Alerts')).toBeInTheDocument()
  })

  it('renders user email', () => {
    render(<Header />)
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
  })

  it('renders user role badge', () => {
    render(<Header />)
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('renders theme switcher', () => {
    render(<Header />)
    expect(screen.getByTitle('Theme: dark')).toBeInTheDocument()
  })

  it('cycles theme on click', () => {
    render(<Header />)
    fireEvent.click(screen.getByTitle('Theme: dark'))
    expect(useThemeStore.getState().mode).toBe('light')
  })

  it('renders sign out button', () => {
    render(<Header />)
    expect(screen.getByTitle('Sign out')).toBeInTheDocument()
  })

  it('calls logout on sign out click', () => {
    render(<Header />)
    fireEvent.click(screen.getByTitle('Sign out'))
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
