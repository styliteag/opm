import { useQuery } from '@tanstack/react-query'

import { fetchApi } from '@/lib/api'

interface GlobalPort {
  ip: string
  port: number
  protocol: string
  ttl: number | null
  banner: string | null
  service_guess: string | null
  mac_address: string | null
  mac_vendor: string | null
  first_seen_at: string
  last_seen_at: string
  network_id: number
  is_stale: boolean
}

interface GlobalPortListResponse {
  ports: GlobalPort[]
}

interface GlobalPortFilters {
  network_id?: number
  service?: string
  staleness?: 'all' | 'active' | 'stale'
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

function buildParams(filters: GlobalPortFilters): string {
  const params = new URLSearchParams()
  if (filters.network_id) params.set('network_id', String(filters.network_id))
  if (filters.service) params.set('service', filters.service)
  if (filters.staleness && filters.staleness !== 'all') params.set('staleness', filters.staleness)
  params.set('sort_by', filters.sort_by ?? 'ip')
  params.set('sort_dir', filters.sort_dir ?? 'asc')
  params.set('offset', String(filters.offset ?? 0))
  params.set('limit', String(filters.limit ?? 50))
  return params.toString()
}

export type { GlobalPort }

export function useGlobalPorts(filters: GlobalPortFilters) {
  return useQuery({
    queryKey: ['ports', 'global', filters],
    queryFn: () =>
      fetchApi<GlobalPortListResponse>(`/api/ports?${buildParams(filters)}`),
  })
}
