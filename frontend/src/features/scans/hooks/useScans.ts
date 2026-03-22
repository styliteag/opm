import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { fetchApi, postApi, deleteApi } from '@/lib/api'
import type { ScanSummary } from '@/lib/types'

interface ScanListResponse {
  scans: ScanSummary[]
}

interface ScanDetail extends ScanSummary {
  network_name: string | null
  scanner_name: string | null
  open_ports: {
    ip: string
    port: number
    protocol: string
    banner: string | null
    service_guess: string | null
  }[]
}

interface ScanLogEntry {
  timestamp: string
  level: string
  message: string
}

interface ScanLogsResponse {
  logs: ScanLogEntry[]
}

export function useScans(offset = 0, limit = 50) {
  return useQuery({
    queryKey: ['scans', offset, limit],
    queryFn: () =>
      fetchApi<ScanListResponse>(`/api/scans?offset=${offset}&limit=${limit}`),
    refetchInterval: 15_000,
  })
}

export function useScanDetail(scanId: number) {
  return useQuery({
    queryKey: ['scans', scanId],
    queryFn: () => fetchApi<ScanDetail>(`/api/scans/${scanId}`),
    enabled: scanId > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' || status === 'planned' ? 5_000 : false
    },
  })
}

export function useScanLogs(scanId: number) {
  return useQuery({
    queryKey: ['scans', scanId, 'logs'],
    queryFn: () => fetchApi<ScanLogsResponse>(`/api/scans/${scanId}/logs`),
    enabled: scanId > 0,
    refetchInterval: 5_000,
  })
}

export function useScanMutations() {
  const qc = useQueryClient()

  const cancel = useMutation({
    mutationFn: (scanId: number) =>
      postApi(`/api/scans/${scanId}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scans'] }),
  })

  const remove = useMutation({
    mutationFn: (scanId: number) => deleteApi(`/api/scans/${scanId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scans'] }),
  })

  return { cancel, remove }
}
