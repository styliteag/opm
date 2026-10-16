import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useAlerts } from './useAlerts'
import { useAuthStore } from '@/stores/auth.store'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useAlerts', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  })

  it('fetches alerts from /api/alerts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        alerts: [
          { id: 1, type: 'new_port', severity: 'high', message: 'Port 80 opened' },
          { id: 2, type: 'blocked', severity: 'critical', message: 'Port 22 blocked' },
        ],
      }),
    }))

    const { result } = renderHook(
      () => useAlerts({ limit: 50 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.alerts).toHaveLength(2)
  })

  it('passes filter params to URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ alerts: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(
      () => useAlerts({ type: 'new_port', network_id: 3, dismissed: false, limit: 25 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('type=new_port')
    expect(url).toContain('network_id=3')
    expect(url).toContain('dismissed=false')
    expect(url).toContain('limit=25')
  })

  it('uses offset for pagination', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ alerts: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(
      () => useAlerts({ offset: 100, limit: 50 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('offset=100')
  })

  it('passes queue_state and policy_state to URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ alerts: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(
      () => useAlerts({ queue_state: 'inbox', policy_state: 'allowed' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('queue_state=inbox')
    expect(url).toContain('policy_state=allowed')
  })
})
