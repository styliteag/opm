import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../../../lib/api'
import type { HostOverviewResponse } from '../../../types'

export function useHostDetail(hostId: number) {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const overviewQuery = useQuery({
    queryKey: ['hosts', hostId, 'overview'],
    queryFn: () => fetchJson<HostOverviewResponse>(`/api/hosts/${hostId}/overview`, token ?? ''),
    enabled: Boolean(token && hostId > 0),
  })

  const invalidateOverview = () => {
    queryClient.invalidateQueries({ queryKey: ['hosts', hostId, 'overview'] })
  }

  const dismissMutation = useMutation({
    mutationFn: async ({
      alertId,
      reason,
      include_ssh_findings,
    }: {
      alertId: number
      reason?: string
      include_ssh_findings?: boolean
    }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/dismiss`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(token ?? ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: reason || null,
          include_ssh_findings: include_ssh_findings ?? false,
        }),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: invalidateOverview,
  })

  const reopenMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/reopen`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: invalidateOverview,
  })

  const updateCommentMutation = useMutation({
    mutationFn: async (comment: string | null) => {
      const response = await fetch(`${API_BASE_URL}/api/hosts/${hostId}`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(token ?? ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_comment: comment }),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: invalidateOverview,
  })

  const updateHostnameMutation = useMutation({
    mutationFn: async (hostname: string | null) => {
      const response = await fetch(`${API_BASE_URL}/api/hosts/${hostId}`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(token ?? ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hostname }),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: invalidateOverview,
  })

  const rescanMutation = useMutation({
    mutationFn: async (hostIp: string) => {
      const response = await fetch(`${API_BASE_URL}/api/hosts/${hostIp}/rescan`, {
        method: 'POST',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
      return response.json()
    },
    onSuccess: invalidateOverview,
  })

  const createRuleMutation = useMutation({
    mutationFn: async (payload: {
      network_id?: number | null
      ip?: string | null
      port: string
      rule_type: 'accepted' | 'critical'
      description?: string | null
    }) => {
      const response = await fetch(`${API_BASE_URL}/api/port-rules`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(token ?? ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
      return response.json()
    },
    onSuccess: () => {
      invalidateOverview()
      queryClient.invalidateQueries({ queryKey: ['port-rules'] })
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: async ({ scope, ruleId }: { scope: string; ruleId: number }) => {
      const response = await fetch(`${API_BASE_URL}/api/port-rules/${scope}/${ruleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: () => {
      invalidateOverview()
      queryClient.invalidateQueries({ queryKey: ['port-rules'] })
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  return {
    overviewQuery,
    dismissMutation,
    reopenMutation,
    updateCommentMutation,
    updateHostnameMutation,
    rescanMutation,
    createRuleMutation,
    deleteRuleMutation,
    isAdmin,
    token,
  }
}
