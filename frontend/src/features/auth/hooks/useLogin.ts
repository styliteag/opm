import { useMutation } from '@tanstack/react-query'

import { extractErrorMessage } from '@/lib/api-client'
import type { User } from '@/stores/auth.store'
import { useAuthStore } from '@/stores/auth.store'

interface LoginResponse {
  access_token: string | null
  token_type: string | null
  requires_2fa: boolean
  challenge_token: string | null
}

export function useLogin() {
  return useMutation({
    mutationFn: async (credentials: {
      email: string
      password: string
    }): Promise<LoginResponse> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
      if (!res.ok) {
        const msg = await extractErrorMessage(res)
        throw new Error(msg)
      }
      return (await res.json()) as LoginResponse
    },
  })
}

export function useVerify2FA() {
  const login = useAuthStore((s) => s.login)

  return useMutation({
    mutationFn: async (args: {
      challenge_token: string
      code: string
    }): Promise<{ access_token: string }> => {
      const res = await fetch('/api/auth/login/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (!res.ok) {
        const msg = await extractErrorMessage(res)
        throw new Error(msg)
      }
      const data = await res.json()
      if (!data.access_token) throw new Error('Login failed')
      return data
    },
    onSuccess: async (data) => {
      const userRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      if (!userRes.ok) throw new Error('Failed to fetch user')
      const user: User = await userRes.json()
      login(data.access_token, user)
    },
  })
}

export function useFinalizeLogin() {
  const login = useAuthStore((s) => s.login)

  return async (accessToken: string) => {
    const userRes = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!userRes.ok) throw new Error('Failed to fetch user')
    const user: User = await userRes.json()
    login(accessToken, user)
  }
}
