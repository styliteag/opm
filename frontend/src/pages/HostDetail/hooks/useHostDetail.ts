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

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts', hostId, 'overview'] })
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts', hostId, 'overview'] })
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts', hostId, 'overview'] })
    },
  })

  return {
    overviewQuery,
    acknowledgeMutation,
    updateCommentMutation,
    rescanMutation,
    isAdmin,
    token,
  }
}
