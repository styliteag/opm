import { useMutation } from '@tanstack/react-query'

import { extractErrorMessage } from '@/lib/api-client'
import type { User } from '@/stores/auth.store'
import { useAuthStore } from '@/stores/auth.store'

interface LoginResponse {
  access_token: string
  token_type: string
}

export function useLogin() {
  const login = useAuthStore((s) => s.login)

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
      if (!res.ok) {
        const msg = await extractErrorMessage(res)
        throw new Error(msg)
      }
      const data: LoginResponse = await res.json()
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
