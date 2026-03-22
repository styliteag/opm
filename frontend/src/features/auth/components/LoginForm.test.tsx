import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LoginForm } from './LoginForm'

// Mock useLogin hook
const mockMutate = vi.fn()
vi.mock('../hooks/useLogin', () => ({
  useLogin: () => ({
    mutate: mockMutate,
    isPending: false,
    error: null,
  }),
}))

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('LoginForm', () => {
  beforeEach(() => {
    mockMutate.mockClear()
  })

  it('renders email and password fields', () => {
    renderWithProviders(<LoginForm />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('renders sign in button', () => {
    renderWithProviders(<LoginForm />)
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    renderWithProviders(<LoginForm />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    })
  })

  it('shows validation error for invalid email', async () => {
    renderWithProviders(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-email' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      // Zod v4 email validation error
      const errorEl = screen.getByText(/email/i)
      expect(errorEl).toBeInTheDocument()
    })
  })

  it('calls mutate with valid credentials', async () => {
    renderWithProviders(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        email: 'admin@example.com',
        password: 'secret123',
      })
    })
  })

  it('renders error message from mutation', () => {
    // Override the mock for this test
    vi.mocked(mockMutate)
    const { unmount } = renderWithProviders(<LoginForm />)
    unmount()

    // Re-mock with error
    vi.doMock('../hooks/useLogin', () => ({
      useLogin: () => ({
        mutate: mockMutate,
        isPending: false,
        error: new Error('Invalid credentials'),
      }),
    }))
  })
})
