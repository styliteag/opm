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
export type StatusFilter = 'all' | 'critical_rule' | 'pending' | 'accepted' | 'dismissed'
export type CategoryFilter = 'all' | 'ssh' | 'port'
export type SortColumn = 'severity' | 'type' | 'ip' | 'port' | 'network' | 'time'
export type SortDirection = 'asc' | 'desc'

export type AlertFiltersState = {
  searchQuery: string
  severityFilter: Severity | ''
  networkFilter: number | null
  statusFilter: StatusFilter
  categoryFilter: CategoryFilter
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

  type AcceptedRuleInfo = {
    ruleId: number
    scope: 'global' | 'network'
    description: string
  }

  // Build lookup maps for both accepted and critical rules, keyed by specificity tier
  const ruleMaps = useMemo(() => {
    const rules = policyQuery.data?.rules ?? []
    const accepted = {
      globalIpKeys: new Map<string, AcceptedRuleInfo>(),
      globalPortKeys: new Map<string, AcceptedRuleInfo>(),
      ipKeys: new Map<string, AcceptedRuleInfo>(),
      networkKeys: new Map<string, AcceptedRuleInfo>(),
    }
    const critical = {
      globalIpKeys: new Set<string>(),
      globalPortKeys: new Set<string>(),
      ipKeys: new Set<string>(),
      networkKeys: new Set<string>(),
    }
    rules.forEach((rule) => {
      const isGlobal = rule.network_id === null
      if (rule.rule_type === 'accepted') {
        const info: AcceptedRuleInfo = {
          ruleId: rule.id,
          scope: isGlobal ? 'global' : 'network',
          description: rule.description ?? '',
        }
        if (isGlobal) {
          if (rule.ip) accepted.globalIpKeys.set(`${rule.ip}:${rule.port}`, info)
          else accepted.globalPortKeys.set(rule.port, info)
        } else {
          if (rule.ip) accepted.ipKeys.set(`${rule.network_id}:${rule.ip}:${rule.port}`, info)
          else accepted.networkKeys.set(`${rule.network_id}:${rule.port}`, info)
        }
      } else if (rule.rule_type === 'critical') {
        if (isGlobal) {
          if (rule.ip) critical.globalIpKeys.add(`${rule.ip}:${rule.port}`)
          else critical.globalPortKeys.add(rule.port)
        } else {
          if (rule.ip) critical.ipKeys.add(`${rule.network_id}:${rule.ip}:${rule.port}`)
          else critical.networkKeys.add(`${rule.network_id}:${rule.port}`)
        }
      }
    })
    return { accepted, critical }
  }, [policyQuery.data?.rules])

  // Resolve effective rule status by specificity: IP-specific > port-only.
  // At same specificity, accepted wins (explicit user override).
  const getEffectiveRuleStatus = useCallback(
    (alert: Alert): 'accepted' | 'critical' | null => {
      const ipPort = `${alert.ip}:${alert.port}`
      const port = String(alert.port)
      const { accepted, critical } = ruleMaps

      // Tier 1: IP-specific rules (highest specificity)
      const accIp =
        accepted.globalIpKeys.has(ipPort) ||
        (alert.network_id !== null &&
          accepted.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`))
      const critIp =
        critical.globalIpKeys.has(ipPort) ||
        (alert.network_id !== null &&
          critical.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`))

      if (accIp || critIp) return accIp ? 'accepted' : 'critical'

      // Tier 2: Port-only rules (lower specificity)
      const accPort =
        accepted.globalPortKeys.has(port) ||
        (alert.network_id !== null && accepted.networkKeys.has(`${alert.network_id}:${port}`))
      const critPort =
        critical.globalPortKeys.has(port) ||
        (alert.network_id !== null && critical.networkKeys.has(`${alert.network_id}:${port}`))

      if (accPort || critPort) return accPort ? 'accepted' : 'critical'

      return null
    },
    [ruleMaps],
  )

  const getAcceptedRuleInfo = useCallback(
    (alert: Alert): AcceptedRuleInfo | null => {
      if (getEffectiveRuleStatus(alert) !== 'accepted') return null
      return (
        ruleMaps.accepted.globalIpKeys.get(`${alert.ip}:${alert.port}`) ??
        ruleMaps.accepted.globalPortKeys.get(String(alert.port)) ??
        (alert.network_id !== null
          ? (ruleMaps.accepted.ipKeys.get(`${alert.network_id}:${alert.ip}:${alert.port}`) ??
            ruleMaps.accepted.networkKeys.get(`${alert.network_id}:${alert.port}`) ??
            null)
          : null)
      )
    },
    [ruleMaps, getEffectiveRuleStatus],
  )

  const getAcceptedReason = useCallback(
    (alert: Alert): string | null => getAcceptedRuleInfo(alert)?.description || null,
    [getAcceptedRuleInfo],
  )

  const isAlertAccepted = useCallback(
    (alert: Alert) => getEffectiveRuleStatus(alert) === 'accepted',
    [getEffectiveRuleStatus],
  )

  const filteredAlerts = useMemo(() => {
    const {
      searchQuery,
      severityFilter,
      networkFilter,
      statusFilter,
      categoryFilter,
      assignedUserFilter,
      sortColumn,
      sortDirection,
    } = filters

    const filtered = alerts.filter((alert) => {
      if (severityFilter && alert.severity !== severityFilter) return false
      if (networkFilter && alert.network_id !== networkFilter) return false
      if (statusFilter === 'critical_rule' && getEffectiveRuleStatus(alert) !== 'critical')
        return false
      if (statusFilter === 'pending' && alert.dismissed) return false
      if (statusFilter === 'accepted' && getEffectiveRuleStatus(alert) !== 'accepted') return false
      if (
        statusFilter === 'dismissed' &&
        (!alert.dismissed || getEffectiveRuleStatus(alert) === 'accepted')
      )
        return false

      if (categoryFilter !== 'all' && alert.source !== categoryFilter) return false

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
          (portData?.banner && portData.banner.toLowerCase().includes(query)) ||
          (alert.last_comment && alert.last_comment.toLowerCase().includes(query)) ||
          (alert.user_comment && alert.user_comment.toLowerCase().includes(query))
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

    // Compute a representative sort value per ip:port group so groups stay together.
    // For each group, use the port alert's value (preferred) or the first alert's value.
    const groupKey = (alert: Alert) => `${alert.ip}:${alert.port}`
    const groupSortVal = new Map<string, number>()

    const getSortVal = (alert: Alert): number => {
      switch (sortColumn) {
        case 'severity':
          return severityOrder[alert.severity as Severity]
        case 'type':
          return alert.type.startsWith('ssh_') ? 1 : 0
        case 'ip':
          return 0 // handled separately
        case 'port':
          return alert.port ?? 0
        case 'network':
          return 0 // handled separately
        case 'time':
          return parseUtcDate(alert.created_at).getTime()
      }
    }

    for (const alert of filtered) {
      const key = groupKey(alert)
      const val = getSortVal(alert)
      const existing = groupSortVal.get(key)
      const isPortAlert = !alert.type.startsWith('ssh_')
      if (existing === undefined || isPortAlert) {
        groupSortVal.set(key, val)
      }
    }

    return filtered.sort((a, b) => {
      const keyA = groupKey(a)
      const keyB = groupKey(b)

      // Different ip:port group — sort by group representative value
      if (keyA !== keyB) {
        let comparison = 0
        if (sortColumn === 'ip') {
          comparison = compareIPs(a.ip, b.ip)
          if (comparison === 0) comparison = (a.port ?? 0) - (b.port ?? 0)
        } else if (sortColumn === 'network') {
          comparison = (a.network_name ?? '').localeCompare(b.network_name ?? '')
        } else {
          comparison = (groupSortVal.get(keyA) ?? 0) - (groupSortVal.get(keyB) ?? 0)
        }
        if (comparison !== 0) return sortDirection === 'asc' ? comparison : -comparison
        // Tiebreak: ip then port
        const ipCmp = compareIPs(a.ip, b.ip)
        if (ipCmp !== 0) return ipCmp
        return (a.port ?? 0) - (b.port ?? 0)
      }

      // Same ip:port group — port alerts first, then SSH alerts
      const aIsSSH = a.type.startsWith('ssh_') ? 1 : 0
      const bIsSSH = b.type.startsWith('ssh_') ? 1 : 0
      return aIsSSH - bIsSSH
    })
  }, [alerts, filters, isAlertAccepted, getEffectiveRuleStatus, portMap])

  // Mutations
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
    queryClient.invalidateQueries({ queryKey: ['alert-comments'] })
    queryClient.invalidateQueries({ queryKey: ['port-rules'] })
  }

  const acceptGloballyMutation = useMutation({
    mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-accept-global`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: alertIds, reason }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const acceptInNetworkMutation = useMutation({
    mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-accept-network`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: alertIds, reason }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const bulkDismissMutation = useMutation({
    mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason?: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/dismiss-bulk`, {
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

  const singleDismissMutation = useMutation({
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

  const reopenMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/reopen`, {
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

  const bulkReopenMutation = useMutation({
    mutationFn: async (alertIds: number[]) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-reopen`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: alertIds }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (alertIds: number[]) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-delete`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_ids: alertIds }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: invalidateAll,
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

  const revokeAcceptanceMutation = useMutation({
    mutationFn: async ({ scope, ruleId }: { scope: 'global' | 'network'; ruleId: number }) => {
      const res = await fetch(`${API_BASE_URL}/api/port-rules/${scope}/${ruleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
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
    getAcceptedReason,
    getAcceptedRuleInfo,
    revokeAcceptanceMutation,
    acceptGloballyMutation,
    acceptInNetworkMutation,
    bulkDismissMutation,
    singleDismissMutation,
    reopenMutation,
    bulkReopenMutation,
    bulkDeleteMutation,
    assignAlertMutation,
    updateCommentMutation,
    rescanHostMutation,
    createRuleMutation,
  }
}
