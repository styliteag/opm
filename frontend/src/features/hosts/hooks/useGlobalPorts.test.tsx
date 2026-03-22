import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useGlobalPorts } from './useGlobalPorts'
import { useAuthStore } from '@/stores/auth.store'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useGlobalPorts', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  })

  it('fetches ports from /api/ports', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ports: [
          { ip: '10.0.0.1', port: 80, protocol: 'tcp', service_guess: 'http' },
        ],
      }),
    }))

    const { result } = renderHook(
      () => useGlobalPorts({}),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.ports).toHaveLength(1)
    expect(result.current.data?.ports[0].service_guess).toBe('http')
  })

  it('passes network_id and service filters', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ports: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(
      () => useGlobalPorts({ network_id: 2, service: 'ssh' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('network_id=2')
    expect(url).toContain('service=ssh')
  })
})
