import { useQuery } from '@tanstack/react-query'

import { fetchApi } from '@/lib/api'
import type { HostListResponse, HostOverviewResponse } from '@/lib/types'

interface HostFilters {
  network_id?: number
  ip_search?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

function buildHostParams(filters: HostFilters): string {
  const params = new URLSearchParams()
  if (filters.network_id) params.set('network_id', String(filters.network_id))
  if (filters.ip_search) params.set('ip_search', filters.ip_search)
  params.set('sort_by', filters.sort_by ?? 'last_seen_at')
  params.set('sort_dir', filters.sort_dir ?? 'desc')
  params.set('offset', String(filters.offset ?? 0))
  params.set('limit', String(filters.limit ?? 50))
  return params.toString()
}

export function useHosts(filters: HostFilters) {
  return useQuery({
    queryKey: ['hosts', filters],
    queryFn: () =>
      fetchApi<HostListResponse>(`/api/hosts?${buildHostParams(filters)}`),
  })
}

export function useHostDetail(hostId: number) {
  return useQuery({
    queryKey: ['hosts', hostId, 'overview'],
    queryFn: () =>
      fetchApi<HostOverviewResponse>(`/api/hosts/${hostId}/overview`),
    enabled: hostId > 0,
  })
}
