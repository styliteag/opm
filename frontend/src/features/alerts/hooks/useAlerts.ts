import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { fetchApi, postApi, putApi, deleteApi } from '@/lib/api'
import type {
  AlertListResponse,
  AlertComment,
  DismissSuggestion,
  Severity,
  AlertType,
} from '@/lib/types'

interface AlertFilters {
  type?: AlertType
  network_id?: number
  dismissed?: boolean
  ip?: string
  severity?: Severity
  offset?: number
  limit?: number
}

function buildAlertParams(filters: AlertFilters): string {
  const params = new URLSearchParams()
  if (filters.type) params.set('type', filters.type)
  if (filters.network_id) params.set('network_id', String(filters.network_id))
  if (filters.dismissed !== undefined) params.set('dismissed', String(filters.dismissed))
  if (filters.ip) params.set('ip', filters.ip)
  if (filters.offset) params.set('offset', String(filters.offset))
  params.set('limit', String(filters.limit ?? 50))
  return params.toString()
}

export function useAlerts(filters: AlertFilters) {
  return useQuery({
    queryKey: ['alerts', filters],
    queryFn: () =>
      fetchApi<AlertListResponse>(`/api/alerts?${buildAlertParams(filters)}`),
    refetchInterval: 30_000,
  })
}

export function useAlertComments(alertId: number) {
  return useQuery({
    queryKey: ['alerts', alertId, 'comments'],
    queryFn: async () => {
      const res = await fetchApi<{ comments: AlertComment[] }>(`/api/alerts/${alertId}/comments`)
      return res.comments
    },
    enabled: alertId > 0,
  })
}

export function useDismissSuggestions(port?: number) {
  return useQuery({
    queryKey: ['alerts', 'dismiss-suggestions', port],
    queryFn: () => {
      const params = port ? `?port=${port}` : ''
      return fetchApi<{ suggestions: DismissSuggestion[] }>(
        `/api/alerts/dismiss-suggestions${params}`,
      )
    },
  })
}

export function useAlertMutations() {
  const qc = useQueryClient()

  const dismiss = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      putApi(`/api/alerts/${id}/dismiss`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const reopen = useMutation({
    mutationFn: (id: number) => putApi(`/api/alerts/${id}/reopen`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const bulkDismiss = useMutation({
    mutationFn: (data: { alert_ids: number[]; reason: string }) =>
      postApi('/api/alerts/bulk-dismiss', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const bulkAcceptGlobal = useMutation({
    mutationFn: (data: { alert_ids: number[]; reason: string }) =>
      postApi('/api/alerts/bulk-accept-global', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const bulkAcceptNetwork = useMutation({
    mutationFn: (data: { alert_ids: number[]; network_id: number; reason: string }) =>
      postApi('/api/alerts/bulk-accept-network', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const bulkReopen = useMutation({
    mutationFn: (data: { alert_ids: number[] }) =>
      putApi('/api/alerts/bulk-reopen', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      patchApi(`/api/alerts/${id}/status`, { resolution_status: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const assign = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number | null }) =>
      patchApi(`/api/alerts/${id}/assign`, { assigned_to_user_id: userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  return { dismiss, reopen, bulkDismiss, bulkAcceptGlobal, bulkAcceptNetwork, bulkReopen, updateStatus, assign, remove }
}

// Need patchApi import
import { patchApi } from '@/lib/api'
