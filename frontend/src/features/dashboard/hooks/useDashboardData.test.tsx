import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useNetworks, useScanners, useRecentAlerts, useActiveAlertCount, useTotalHostCount, useLatestScans, useAlertTrend } from './useDashboardData'
import { useAuthStore } from '@/stores/auth.store'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('dashboard hooks', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'test-token', user: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
  })

  describe('useNetworks', () => {
    it('fetches networks from /api/networks', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ networks: [{ id: 1, name: 'LAN', cidr: '10.0.0.0/24' }] }),
      }))

      const { result } = renderHook(() => useNetworks(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.networks).toHaveLength(1)
      expect(result.current.data?.networks[0].name).toBe('LAN')
    })
  })

  describe('useScanners', () => {
    it('fetches scanners from /api/scanners', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ scanners: [{ id: 1, name: 'HQ Berlin' }] }),
      }))

      const { result } = renderHook(() => useScanners(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.scanners[0].name).toBe('HQ Berlin')
    })
  })

  describe('useRecentAlerts', () => {
    it('fetches recent alerts with limit', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ alerts: [{ id: 1, message: 'test alert' }] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const { result } = renderHook(() => useRecentAlerts(5), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('limit=5')
      expect(url).toContain('dismissed=false')
    })
  })

  describe('useActiveAlertCount', () => {
    it('returns count of active alerts', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          alerts: Array.from({ length: 42 }, (_, i) => ({ id: i })),
        }),
      }))

      const { result } = renderHook(() => useActiveAlertCount(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBe(42)
    })
  })

  describe('useTotalHostCount', () => {
    it('returns total host count', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ hosts: [], total_count: 1402, pingable_count: 800 }),
      }))

      const { result } = renderHook(() => useTotalHostCount(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBe(1402)
    })
  })

  describe('useLatestScans', () => {
    it('fetches latest scans by network', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          latest_scans: [{ network_id: 1, scan: { id: 10, status: 'completed' } }],
        }),
      }))

      const { result } = renderHook(() => useLatestScans(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.latest_scans).toHaveLength(1)
    })
  })

  describe('useAlertTrend', () => {
    it('fetches alert trend data', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ date: '2026-03-01', count: 10, dismissed_count: 3 }],
        }),
      }))

      const { result } = renderHook(() => useAlertTrend(), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.data).toHaveLength(1)
    })
  })
})
