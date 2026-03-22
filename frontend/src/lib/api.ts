import { useAuthStore } from '@/stores/auth.store'

const getHeaders = (): HeadersInit => {
  const token = useAuthStore.getState().token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...getHeaders(), ...init?.headers },
  })
  if (res.status === 401) {
    useAuthStore.getState().logout()
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg =
      typeof body?.detail === 'string'
        ? body.detail
        : Array.isArray(body?.detail)
          ? body.detail.map((e: { msg?: string }) => e.msg).join('; ')
          : res.statusText
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export function postApi<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function putApi<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export function patchApi<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteApi(path: string): Promise<void> {
  return fetchApi(path, { method: 'DELETE' })
}
