import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useAlerts, useAlertMutations, useDismissSuggestions } from './useAlerts'
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
})

describe('useAlertMutations', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  })

  it('provides dismiss mutation', () => {
    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })
    expect(result.current.dismiss).toBeDefined()
    expect(result.current.dismiss.mutate).toBeTypeOf('function')
  })

  it('provides reopen mutation', () => {
    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })
    expect(result.current.reopen).toBeDefined()
  })

  it('provides bulkDismiss mutation', () => {
    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })
    expect(result.current.bulkDismiss).toBeDefined()
  })

  it('provides bulkReopen mutation', () => {
    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })
    expect(result.current.bulkReopen).toBeDefined()
  })

  it('provides updateStatus mutation', () => {
    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })
    expect(result.current.updateStatus).toBeDefined()
  })

  it('provides assign mutation', () => {
    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })
    expect(result.current.assign).toBeDefined()
  })

  it('provides remove mutation', () => {
    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })
    expect(result.current.remove).toBeDefined()
  })

  it('dismiss mutation calls PUT /api/alerts/:id/dismiss', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })

    result.current.dismiss.mutate({ id: 5, reason: 'Known service' })

    await waitFor(() => expect(result.current.dismiss.isSuccess).toBe(true))
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/alerts/5/dismiss')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ reason: 'Known service' })
  })

  it('reopen mutation calls PUT /api/alerts/:id/reopen', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })

    result.current.reopen.mutate(7)

    await waitFor(() => expect(result.current.reopen.isSuccess).toBe(true))
    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/alerts/7/reopen')
  })

  it('bulkDismiss mutation calls POST /api/alerts/bulk-dismiss', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })

    result.current.bulkDismiss.mutate({ alert_ids: [1, 2, 3], reason: 'Batch' })

    await waitFor(() => expect(result.current.bulkDismiss.isSuccess).toBe(true))
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/alerts/bulk-dismiss')
    expect(init.method).toBe('POST')
  })

  it('remove mutation calls DELETE /api/alerts/:id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useAlertMutations(), { wrapper: createWrapper() })

    result.current.remove.mutate(10)

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true))
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/alerts/10')
    expect(init.method).toBe('DELETE')
  })
})

describe('useDismissSuggestions', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  })

  it('fetches suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        suggestions: [{ reason: 'Known service', frequency: 5, last_used: null, same_port: true }],
      }),
    }))

    const { result } = renderHook(
      () => useDismissSuggestions(80),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.suggestions).toHaveLength(1)
  })
})
