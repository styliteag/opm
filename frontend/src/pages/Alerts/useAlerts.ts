import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../../lib/api'
import { parseUtcDate } from '../../lib/formatters'
import type {
  Alert,
  AlertListResponse,
  NetworkListResponse,
  PortRuleUnifiedListResponse,
  GlobalOpenPort,
  GlobalOpenPortListResponse,
  UserListResponse,
} from '../../types'

export type Severity = 'critical' | 'high' | 'medium' | 'info'
export type StatusFilter = 'all' | 'blocked' | 'pending' | 'approved' | 'monitoring'
export type SortColumn = 'severity' | 'ip' | 'port' | 'network' | 'time'
export type SortDirection = 'asc' | 'desc'

export type AlertFiltersState = {
  searchQuery: string
  severityFilter: Severity | ''
  networkFilter: number | null
  statusFilter: StatusFilter
  assignedUserFilter: number | 'all' | 'unassigned'
  sortColumn: SortColumn
  sortDirection: SortDirection
}

const compareIPs = (ipA: string, ipB: string): number => {
  const isIPv4 = (ip: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)
  const aIsV4 = isIPv4(ipA)
  const bIsV4 = isIPv4(ipB)
  if (aIsV4 && !bIsV4) return -1
  if (!aIsV4 && bIsV4) return 1
  if (aIsV4 && bIsV4) {
    const aParts = ipA.split('.').map(Number)
    const bParts = ipB.split('.').map(Number)
    for (let i = 0; i < 4; i++) {
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i]
    }
    return 0
  }
  const expandIPv6 = (ip: string): string => {
    if (!ip.includes(':')) return ip
    let expanded = ip
    if (expanded.includes('::')) {
      const sides = expanded.split('::')
      const leftParts = sides[0] ? sides[0].split(':') : []
      const rightParts = sides[1] ? sides[1].split(':') : []
      const missingParts = 8 - leftParts.length - rightParts.length
      const middleParts = Array(missingParts).fill('0')
      expanded = [...leftParts, ...middleParts, ...rightParts].join(':')
    }
    return expanded
      .split(':')
      .map((seg) => seg.padStart(4, '0'))
      .join(':')
  }
  return expandIPv6(ipA).localeCompare(expandIPv6(ipB))
}

export const getServiceName = (
  serviceGuess: string | null | undefined,
  banner: string | null | undefined,
): string => {
  if (serviceGuess) return serviceGuess
  if (banner) {
    const firstWord = banner.split(' ')[0]
    if (firstWord) return firstWord
  }
  return 'Unknown Service'
}

export function useAlerts(filters: AlertFiltersState) {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'all'],
    queryFn: () => fetchJson<AlertListResponse>('/api/alerts?limit=200', token ?? ''),
    enabled: Boolean(token),
  })

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const policyQuery = useQuery({
    queryKey: ['port-rules'],
    queryFn: () => fetchJson<PortRuleUnifiedListResponse>('/api/port-rules', token ?? ''),
    enabled: Boolean(token),
  })

  const globalPortsQuery = useQuery({
    queryKey: ['global-ports'],
    queryFn: () => fetchJson<GlobalOpenPortListResponse>('/api/global-ports', token ?? ''),
    enabled: Boolean(token),
  })

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJson<UserListResponse>('/api/users', token ?? ''),
    enabled: Boolean(token),
  })

  const alerts = useMemo(() => alertsQuery.data?.alerts ?? [], [alertsQuery.data?.alerts])
  const networks = useMemo(() => networksQuery.data?.networks ?? [], [networksQuery.data?.networks])
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users])

  const portMap = useMemo(() => {
    const map = new Map<number, GlobalOpenPort>()
    for (const port of globalPortsQuery.data?.ports ?? []) {
      map.set(port.id, port)
    }
    return map
  }, [globalPortsQuery.data?.ports])

  const acceptedSets = useMemo(() => {
    const rules = policyQuery.data?.rules ?? []
    const sets = {
      ipKeys: new Set<string>(),
      networkKeys: new Set<string>(),
      globalIpKeys: new Set<string>(),
      globalPortKeys: new Set<string>(),
    }
    rules.forEach((rule) => {
      if (rule.rule_type !== 'accepted') return
      if (rule.network_id === null) {
        if (rule.ip) sets.globalIpKeys.add(`${rule.ip}:${rule.port}`)
        else sets.globalPortKeys.add(rule.port)
      } else {
        if (rule.ip) sets.ipKeys.add(`${rule.network_id}:${rule.ip}:${rule.port}`)
        else sets.networkKeys.add(`${rule.network_id}:${rule.port}`)
      }
    })
    return sets
  }, [policyQuery.data?.rules])

  const isAlertAccepted = useCallback(
    (alert: Alert) => {
      if (acceptedSets.globalIpKeys.has(`${alert.ip}:${alert.port}`)) return true
      if (acceptedSets.globalPortKeys.has(String(alert.port))) return true
      if (alert.network_id === null) return false
      return (
        acceptedSets.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`) ||
        acceptedSets.networkKeys.has(`${alert.network_id}:${alert.port}`)
      )
    },
    [acceptedSets],
  )

  const filteredAlerts = useMemo(() => {
    const {
      searchQuery,
      severityFilter,
      networkFilter,
      statusFilter,
      assignedUserFilter,
      sortColumn,
      sortDirection,
    } = filters

    const filtered = alerts.filter((alert) => {
      if (severityFilter && alert.severity !== severityFilter) return false
      if (networkFilter && alert.network_id !== networkFilter) return false
      if (statusFilter === 'blocked' && alert.severity !== 'critical') return false
      if (statusFilter === 'pending' && alert.acknowledged) return false
      if (statusFilter === 'approved' && !isAlertAccepted(alert)) return false
      if (statusFilter === 'monitoring' && (!alert.acknowledged || alert.severity === 'critical'))
        return false

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const portData = alert.global_open_port_id ? portMap.get(alert.global_open_port_id) : null
        const serviceName = portData
          ? getServiceName(portData.service_guess, portData.banner).toLowerCase()
          : ''
        const matches =
          alert.ip.toLowerCase().includes(query) ||
          (alert.hostname && alert.hostname.toLowerCase().includes(query)) ||
          String(alert.port).includes(query) ||
          (alert.network_name && alert.network_name.toLowerCase().includes(query)) ||
          serviceName.includes(query) ||
          (portData?.banner && portData.banner.toLowerCase().includes(query))
        if (!matches) return false
      }

      if (assignedUserFilter !== 'all') {
        if (assignedUserFilter === 'unassigned') {
          if (alert.assigned_to_user_id !== null) return false
        } else {
          if (alert.assigned_to_user_id !== assignedUserFilter) return false
        }
      }
      return true
    })

    const severityOrder = { critical: 0, high: 1, medium: 2, info: 3 }
    return filtered.sort((a, b) => {
      let comparison = 0
      switch (sortColumn) {
        case 'severity':
          comparison = severityOrder[a.severity as Severity] - severityOrder[b.severity as Severity]
          break
        case 'ip':
          comparison = compareIPs(a.ip, b.ip)
          break
        case 'port':
          comparison = a.port - b.port
          break
        case 'network':
          comparison = (a.network_name ?? '').localeCompare(b.network_name ?? '')
          break
        case 'time':
          comparison = parseUtcDate(a.created_at).getTime() - parseUtcDate(b.created_at).getTime()
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [alerts, filters, isAlertAccepted, portMap])

  // Mutations
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
    queryClient.invalidateQueries({ queryKey: ['alert-comments'] })
    queryClient.invalidateQueries({ queryKey: ['port-rules'] })
  }

  const bulkWhitelistGlobalMutation = useMutation({
    mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-whitelist-global`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: alertIds, reason }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const bulkWhitelistNetworkMutation = useMutation({
    mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-whitelist-network`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: alertIds, reason }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const bulkAcknowledgeMutation = useMutation({
    mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason?: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/acknowledge-bulk`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: alertIds, reason: reason || null }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alert-comments'] })
    },
  })

  const singleAcknowledgeMutation = useMutation({
    mutationFn: async ({
      alertId,
      reason,
      include_ssh_findings,
    }: {
      alertId: number
      reason?: string
      include_ssh_findings?: boolean
    }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason || null,
          include_ssh_findings: include_ssh_findings ?? false,
        }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alert-comments'] })
    },
  })

  const unacknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/unacknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const assignAlertMutation = useMutation({
    mutationFn: async ({ alertId, userId }: { alertId: number; userId: number | null }) => {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const updateCommentMutation = useMutation({
    mutationFn: async ({ hostId, comment }: { hostId: number; comment: string | null }) => {
      const res = await fetch(`${API_BASE_URL}/api/hosts/${hostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify({ user_comment: comment }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const rescanHostMutation = useMutation({
    mutationFn: async (hostIp: string) => {
      const res = await fetch(`${API_BASE_URL}/api/hosts/${encodeURIComponent(hostIp)}/rescan`, {
        method: 'POST',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
  })

  const createRuleMutation = useMutation({
    mutationFn: async (payload: {
      network_id?: number | null
      ip?: string | null
      port: string
      rule_type: 'accepted' | 'critical'
      description?: string | null
    }) => {
      const res = await fetch(`${API_BASE_URL}/api/port-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: invalidateAll,
  })

  return {
    isAdmin,
    token,
    isLoading: alertsQuery.isLoading || policyQuery.isLoading,
    alerts,
    filteredAlerts,
    networks,
    users,
    portMap,
    isAlertAccepted,
    bulkWhitelistGlobalMutation,
    bulkWhitelistNetworkMutation,
    bulkAcknowledgeMutation,
    singleAcknowledgeMutation,
    unacknowledgeMutation,
    assignAlertMutation,
    updateCommentMutation,
    rescanHostMutation,
    createRuleMutation,
  }
}
