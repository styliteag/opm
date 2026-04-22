import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LoginForm } from './LoginForm'

const mockLoginMutate = vi.fn()
const mockVerifyMutate = vi.fn()
const mockFinalize = vi.fn()

vi.mock('../hooks/useLogin', () => ({
  useLogin: () => ({
    mutate: mockLoginMutate,
    isPending: false,
    error: null,
  }),
  useVerify2FA: () => ({
    mutate: mockVerifyMutate,
    isPending: false,
    error: null,
  }),
  useFinalizeLogin: () => mockFinalize,
}))

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('LoginForm', () => {
  beforeEach(() => {
    mockLoginMutate.mockClear()
    mockVerifyMutate.mockClear()
    mockFinalize.mockClear()
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

  it('calls mutate with valid credentials', async () => {
    renderWithProviders(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(mockLoginMutate).toHaveBeenCalled()
      const [args] = mockLoginMutate.mock.calls[0]
      expect(args).toEqual({
        email: 'admin@example.com',
        password: 'secret123',
      })
    })
  })

  it('finalizes login when no 2FA required', async () => {
    mockLoginMutate.mockImplementation((_data, options) => {
      options?.onSuccess?.({
        access_token: 'jwt-abc',
        token_type: 'bearer',
        requires_2fa: false,
        challenge_token: null,
      })
    })

    renderWithProviders(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(mockFinalize).toHaveBeenCalledWith('jwt-abc')
    })
  })

  it('switches to 2FA code prompt when requires_2fa is true', async () => {
    mockLoginMutate.mockImplementation((_data, options) => {
      options?.onSuccess?.({
        access_token: null,
        token_type: null,
        requires_2fa: true,
        challenge_token: 'challenge-xyz',
      })
    })

    renderWithProviders(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    })
  })

  it('submits verification code to verify mutation', async () => {
    mockLoginMutate.mockImplementation((_data, options) => {
      options?.onSuccess?.({
        access_token: null,
        token_type: null,
        requires_2fa: true,
        challenge_token: 'challenge-xyz',
      })
    })

    renderWithProviders(<LoginForm />)
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'admin@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/verification code/i), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      expect(mockVerifyMutate).toHaveBeenCalledWith({
        challenge_token: 'challenge-xyz',
        code: '123456',
      })
    })
  })
})
