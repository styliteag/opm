import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'

const mockNavigate = vi.fn()

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useRouterState: (opts?: {
    select?: (s: { location: { pathname: string } }) => unknown
  }) => {
    const state = { location: { pathname: '/settings/scan-profiles' } }
    return opts?.select ? opts.select(state) : state
  },
  useNavigate: () => mockNavigate,
}))

// Flatten the base-ui menu so items render without a pointer-driven popup.
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: React.PropsWithChildren) => <div>{children}</div>
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuGroup: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: ({
      children,
      ...props
    }: React.PropsWithChildren<{ 'aria-label'?: string }>) => (
      <button aria-label={props['aria-label']}>{children}</button>
    ),
    DropdownMenuItem: ({
      children,
      onClick,
    }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button role="menuitem" onClick={onClick}>
        {children}
      </button>
    ),
  }
})

import { Header } from './Header'

describe('Header', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    useAuthStore.setState({
      user: { id: 1, email: 'admin@test.com', role: 'admin', theme_preference: 'dark' },
      token: 'token',
      isAuthenticated: true,
    })
    useThemeStore.setState({ mode: 'dark', resolvedTheme: 'dark' })
  })

  it('renders readable breadcrumbs from pathname', () => {
    render(<Header />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Scan profiles')).toBeInTheDocument()
  })

  it('renders the user menu trigger with email and role', () => {
    render(<Header />)
    const trigger = screen.getByRole('button', { name: 'User menu' })
    expect(trigger).toHaveTextContent('admin@test.com')
    expect(trigger).toHaveTextContent('admin')
  })

  it('navigates to account security', () => {
    render(<Header />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Account security/ }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/security' })
  })

  it('cycles theme dark → light → system → dark', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render(<Header />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Theme: dark/ }))
    expect(useThemeStore.getState().mode).toBe('light')
    fireEvent.click(screen.getByRole('menuitem', { name: /Theme: light/ }))
    expect(useThemeStore.getState().mode).toBe('system')
    fireEvent.click(screen.getByRole('menuitem', { name: /Theme: system/ }))
    expect(useThemeStore.getState().mode).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('signs out', () => {
    render(<Header />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }))
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('renders no user menu when signed out', () => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
    render(<Header />)
    expect(screen.queryByRole('button', { name: 'User menu' })).not.toBeInTheDocument()
  })
})
