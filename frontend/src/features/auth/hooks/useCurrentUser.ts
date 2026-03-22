import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { User } from '@/stores/auth.store'
import { useAuthStore } from '@/stores/auth.store'

export function useCurrentUser() {
  const token = useAuthStore((s) => s.token)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async (): Promise<User> => {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Session expired')
      return res.json()
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (query.data) {
      setUser(query.data)
    }
  }, [query.data, setUser])

  useEffect(() => {
    if (query.error) {
      logout()
    }
  }, [query.error, logout])

  return query
}
