import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { fetchApi, postApi, putApi, deleteApi } from '@/lib/api'
import type { Network, ScanSummary } from '@/lib/types'

interface PortRule {
  id: number
  network_id: number | null
  rule_type: 'accepted' | 'critical'
  match_criteria: { port: number; ip?: string }
  description: string | null
  created_at: string
}

export function useNetworkDetail(networkId: number) {
  return useQuery({
    queryKey: ['networks', networkId],
    queryFn: () => fetchApi<Network>(`/api/networks/${networkId}`),
    enabled: networkId > 0,
  })
}

export function useNetworkScans(networkId: number) {
  return useQuery({
    queryKey: ['networks', networkId, 'scans'],
    queryFn: () =>
      fetchApi<{ scans: ScanSummary[] }>(`/api/networks/${networkId}/scans`),
    enabled: networkId > 0,
    refetchInterval: 10_000,
  })
}

export function useNetworkRules(networkId: number) {
  return useQuery({
    queryKey: ['networks', networkId, 'rules'],
    queryFn: () =>
      fetchApi<{ rules: PortRule[] }>(`/api/networks/${networkId}/rules`),
    enabled: networkId > 0,
  })
}

export function useNetworkMutations() {
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: (data: Partial<Network>) =>
      postApi<Network>('/api/networks', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks'] }),
  })

  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<Network> & { id: number }) =>
      putApi<Network>(`/api/networks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/networks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks'] }),
  })

  const triggerScan = useMutation({
    mutationFn: (networkId: number) =>
      postApi(`/api/networks/${networkId}/trigger-scan`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scans'] }),
  })

  return { create, update, remove, triggerScan }
}
