import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useHosts, useHostDetail } from './useHosts'
import { useAuthStore } from '@/stores/auth.store'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useHosts', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  })

  it('fetches hosts with default params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        hosts: [{ id: 1, ip: '10.0.0.1', hostname: 'web-01' }],
        total_count: 1,
        pingable_count: 1,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(
      () => useHosts({}),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.hosts).toHaveLength(1)
    expect(result.current.data?.total_count).toBe(1)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('sort_by=last_seen_at')
    expect(url).toContain('sort_dir=desc')
  })

  it('passes ip_search and network_id filters', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hosts: [], total_count: 0, pingable_count: 0 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(
      () => useHosts({ ip_search: '192.168', network_id: 5 }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('ip_search=192.168')
    expect(url).toContain('network_id=5')
  })
})

describe('useHostDetail', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  })

  it('fetches host overview by ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        host: { id: 42, ip: '10.0.0.42' },
        ports: [],
        alerts: [],
        dismissed_alerts: [],
        dismissed_alert_count: 0,
        ssh: null,
        recent_scans: [],
        networks: [],
        matching_rules: [],
      }),
    }))

    const { result } = renderHook(
      () => useHostDetail(42),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.host.ip).toBe('10.0.0.42')
  })

  it('does not fetch when hostId is 0', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    renderHook(
      () => useHostDetail(0),
      { wrapper: createWrapper() },
    )

    // Give it time, should not fetch
    await new Promise((r) => setTimeout(r, 50))
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
