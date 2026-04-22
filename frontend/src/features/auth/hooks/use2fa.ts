import { useMutation, useQueryClient } from '@tanstack/react-query'

import { extractErrorMessage } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

interface EnrollStartResponse {
  secret: string
  otpauth_uri: string
}

interface EnrollVerifyResponse {
  backup_codes: string[]
}

async function authed<T>(
  url: string,
  body: Record<string, unknown> | null,
  method: 'POST' | 'DELETE' = 'POST',
): Promise<T> {
  const token = useAuthStore.getState().token
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === null ? null : JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await extractErrorMessage(res)
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function useEnrollStart() {
  return useMutation({
    mutationFn: (password: string) =>
      authed<EnrollStartResponse>('/api/auth/2fa/enroll/start', { password }),
  })
}

export function useEnrollVerify() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ password, code }: { password: string; code: string }) =>
      authed<EnrollVerifyResponse>('/api/auth/2fa/enroll/verify', {
        password,
        code,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}

export function useDisable2fa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ password, code }: { password: string; code: string }) =>
      authed<void>('/api/auth/2fa/disable', { password, code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      useAuthStore.getState().logout()
    },
  })
}

export function useRegenerateBackupCodes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ password, code }: { password: string; code: string }) =>
      authed<EnrollVerifyResponse>('/api/auth/2fa/backup-codes/regenerate', {
        password,
        code,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}
