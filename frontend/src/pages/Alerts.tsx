import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type {
  Alert,
  AlertListResponse,
  AlertType,
  BulkAcknowledgeResponse,
  ExcludedPortListResponse,
  NetworkListResponse,
  PortRuleListResponse,
} from '../types'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const parseUtcDate = (dateStr: string) => {
  // API returns UTC timestamps without timezone suffix, so append 'Z' to parse as UTC
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
}

const formatRelativeTime = (value: Date, now: Date) => {
  const diffMs = now.getTime() - value.getTime()
  if (diffMs < 0) {
    return 'Just now'
  }
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) {
    return 'Just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const alertTypeLabels: Record<AlertType, string> = {
  new_port: 'New Port',
  not_allowed: 'Not Allowed',
  blocked: 'Blocked',
}

const alertTypeStyles: Record<AlertType, string> = {
  new_port:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  not_allowed:
    'border-orange-300/50 bg-orange-500/15 text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/20 dark:text-orange-200',
  blocked:
    'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
}

type ActionModalState = {
  alert: Alert
} | null

const Alerts = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionModal, setActionModal] = useState<ActionModalState>(null)
  const [excludeReason, setExcludeReason] = useState('')
  const now = new Date()

  const isAdmin = user?.role === 'admin'

  // Filter state from URL params - default to unacknowledged
  const typeFilter = searchParams.get('type') as AlertType | null
  const networkIdParam = searchParams.get('network_id')
  const networkIdFilter = networkIdParam ? Number(networkIdParam) : null
  const acknowledgedParam = searchParams.get('acknowledged')
  const presetFilter = searchParams.get('preset') ?? 'unack' // Default to unacknowledged

  // Determine acknowledged filter based on preset or explicit param
  const acknowledgedFilter =
    acknowledgedParam !== null
      ? acknowledgedParam === 'true'
        ? true
        : acknowledgedParam === 'false'
          ? false
          : null
      : presetFilter === 'unack'
        ? false
        : presetFilter === 'ack'
          ? true
          : null

  const handlePresetChange = (preset: string) => {
    const newParams = new URLSearchParams()
    newParams.set('preset', preset)
    // Keep network filter if set
    if (networkIdFilter) {
      newParams.set('network_id', String(networkIdFilter))
    }
    // Keep type filter if set
    if (typeFilter) {
      newParams.set('type', typeFilter)
    }
    setSearchParams(newParams)
    setSelectedIds(new Set())
  }

  const alertsQuery = useQuery({
    queryKey: ['alerts', typeFilter, networkIdFilter, acknowledgedFilter, presetFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (typeFilter) {
        params.set('type', typeFilter)
      }
      if (networkIdFilter !== null && Number.isFinite(networkIdFilter) && networkIdFilter > 0) {
        params.set('network_id', String(networkIdFilter))
      }
      // For lastrun, fetch all alerts (we'll filter client-side)
      if (presetFilter !== 'lastrun' && acknowledgedFilter !== null) {
        params.set('acknowledged', String(acknowledgedFilter))
      }
      params.set('limit', '200')
      const queryString = params.toString()
      return fetchJson<AlertListResponse>(
        `/api/alerts${queryString ? `?${queryString}` : ''}`,
        token ?? '',
      )
    },
    enabled: Boolean(token),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const rawAlerts = alertsQuery.data?.alerts ?? []
  const networks = networksQuery.data?.networks ?? []

  // Filter alerts based on preset
  const alerts = (() => {
    if (presetFilter === 'lastrun' && rawAlerts.length > 0) {
      // Find the most recent alert timestamp
      const mostRecent = rawAlerts.reduce((latest, alert) => {
        const alertTime = new Date(alert.created_at).getTime()
        return alertTime > latest ? alertTime : latest
      }, 0)
      // Show alerts within 5 minutes of the most recent
      const threshold = 5 * 60 * 1000 // 5 minutes
      return rawAlerts.filter((alert) => {
        const alertTime = new Date(alert.created_at).getTime()
        return mostRecent - alertTime <= threshold
      })
    }
    return rawAlerts
  })()

  // Get unique network IDs from alerts
  const alertNetworkIds = [...new Set(alerts.map((a) => a.network_id))]
  const alertNetworkKey = alertNetworkIds.sort().join(',')

  // Fetch port rules for networks in alerts
  const portRulesQuery = useQuery({
    queryKey: ['port-rules', alertNetworkKey],
    queryFn: async () => {
      const results = await Promise.all(
        alertNetworkIds.map((networkId) =>
          fetchJson<PortRuleListResponse>(`/api/networks/${networkId}/rules`, token ?? ''),
        ),
      )
      return results.flatMap((result) => result.rules)
    },
    enabled: Boolean(token) && alertNetworkIds.length > 0 && isAdmin,
  })

  // Fetch exclusions for networks in alerts
  const exclusionsQuery = useQuery({
    queryKey: ['excluded-ports', alertNetworkKey],
    queryFn: async () => {
      const results = await Promise.all(
        alertNetworkIds.map((networkId) =>
          fetchJson<ExcludedPortListResponse>(`/api/networks/${networkId}/excluded`, token ?? ''),
        ),
      )
      return results.flatMap((result) => result.excluded_ports)
    },
    enabled: Boolean(token) && alertNetworkIds.length > 0 && isAdmin,
  })

  const portRules = portRulesQuery.data ?? []
  const exclusions = exclusionsQuery.data ?? []

  // Build sets for checking allowed/excluded status
  const allowedSets = {
    ipKeys: new Set<string>(),
    networkKeys: new Set<string>(),
  }
  portRules.forEach((rule) => {
    if (rule.rule_type !== 'allow') return
    // Parse port range to check individual ports
    const portStr = rule.port
    if (rule.ip) {
      allowedSets.ipKeys.add(`${rule.network_id}:${rule.ip}:${portStr}`)
    } else {
      allowedSets.networkKeys.add(`${rule.network_id}:${portStr}`)
    }
  })

  const exclusionSets = {
    ipKeys: new Set<string>(),
    networkKeys: new Set<string>(),
  }
  exclusions.forEach((exclusion) => {
    if (exclusion.ip) {
      exclusionSets.ipKeys.add(`${exclusion.network_id}:${exclusion.ip}:${exclusion.port}`)
    } else {
      exclusionSets.networkKeys.add(`${exclusion.network_id}:${exclusion.port}`)
    }
  })

  const isAllowed = (alert: Alert) =>
    allowedSets.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`) ||
    allowedSets.networkKeys.has(`${alert.network_id}:${alert.port}`)

  const isExcluded = (alert: Alert) =>
    exclusionSets.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`) ||
    exclusionSets.networkKeys.has(`${alert.network_id}:${alert.port}`)

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(token ?? ''),
        },
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
      return response.json() as Promise<Alert>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setActionMessage('Alert acknowledged.')
      setTimeout(() => setActionMessage(null), 3000)
    },
    onError: (error: Error) => {
      setActionMessage(`Failed to acknowledge: ${error.message}`)
      setTimeout(() => setActionMessage(null), 5000)
    },
  })

  const unacknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/unacknowledge`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(token ?? ''),
        },
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
      return response.json() as Promise<Alert>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setActionMessage('Alert reopened.')
      setTimeout(() => setActionMessage(null), 3000)
    },
    onError: (error: Error) => {
      setActionMessage(`Failed to reopen: ${error.message}`)
      setTimeout(() => setActionMessage(null), 5000)
    },
  })

  const bulkAcknowledgeMutation = useMutation({
    mutationFn: async (alertIds: number[]) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/acknowledge-bulk`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(token ?? ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alertIds),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
      return response.json() as Promise<BulkAcknowledgeResponse>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setSelectedIds(new Set())
      const count = data.acknowledged_ids.length
      setActionMessage(`${count} alert${count !== 1 ? 's' : ''} acknowledged.`)
      setTimeout(() => setActionMessage(null), 3000)
    },
    onError: (error: Error) => {
      setActionMessage(`Failed to acknowledge: ${error.message}`)
      setTimeout(() => setActionMessage(null), 5000)
    },
  })

  const whitelistMutation = useMutation({
    mutationFn: async (alert: Alert) => {
      const response = await fetch(`${API_BASE_URL}/api/ports/whitelist`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(token ?? ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          network_id: alert.network_id,
          ip: alert.ip,
          port: String(alert.port),
          description: `Whitelisted from alert: ${alert.message}`,
        }),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
      // Also acknowledge the alert
      await fetch(`${API_BASE_URL}/api/alerts/${alert.id}/acknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setActionModal(null)
      setActionMessage('Port whitelisted and alert acknowledged.')
      setTimeout(() => setActionMessage(null), 3000)
    },
    onError: (error: Error) => {
      setActionMessage(`Failed to whitelist: ${error.message}`)
      setTimeout(() => setActionMessage(null), 5000)
    },
  })

  const excludeMutation = useMutation({
    mutationFn: async ({ alert, reason }: { alert: Alert; reason: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/ports/exclude`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(token ?? ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          network_id: alert.network_id,
          ip: alert.ip,
          port: alert.port,
          reason: reason || `Excluded from alert: ${alert.message}`,
        }),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
      // Also acknowledge the alert
      await fetch(`${API_BASE_URL}/api/alerts/${alert.id}/acknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setActionModal(null)
      setExcludeReason('')
      setActionMessage('Port excluded and alert acknowledged.')
      setTimeout(() => setActionMessage(null), 3000)
    },
    onError: (error: Error) => {
      setActionMessage(`Failed to exclude: ${error.message}`)
      setTimeout(() => setActionMessage(null), 5000)
    },
  })

  const handleAcknowledgeOnly = () => {
    if (actionModal) {
      acknowledgeMutation.mutate(actionModal.alert.id)
      setActionModal(null)
    }
  }

  const handleWhitelist = () => {
    if (actionModal) {
      whitelistMutation.mutate(actionModal.alert)
    }
  }

  const handleExclude = () => {
    if (actionModal) {
      excludeMutation.mutate({ alert: actionModal.alert, reason: excludeReason })
    }
  }

  const isLoading = alertsQuery.isLoading || networksQuery.isLoading
  const hasError = alertsQuery.isError || networksQuery.isError

  // Filter change handlers
  const updateFilter = (key: string, value: string | null) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    setSearchParams(newParams)
  }

  const handleTypeFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilter('type', e.target.value || null)
  }

  const handleNetworkFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilter('network_id', e.target.value || null)
  }

  // Selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const unacknowledgedIds = alerts.filter((a) => !a.acknowledged).map((a) => a.id)
      setSelectedIds(new Set(unacknowledgedIds))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (alertId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(alertId)
      } else {
        next.delete(alertId)
      }
      return next
    })
  }

  const handleBulkAcknowledge = () => {
    if (selectedIds.size === 0) return
    bulkAcknowledgeMutation.mutate(Array.from(selectedIds))
  }

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged)
  const allUnacknowledgedSelected =
    unacknowledgedAlerts.length > 0 && unacknowledgedAlerts.every((a) => selectedIds.has(a.id))
  const someSelected = selectedIds.size > 0

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-rose-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-amber-500/20 blur-[140px]" />

      <section className="relative z-10 space-y-8">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Security Alerts
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">Alerts</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Investigate security alerts, acknowledge findings, and track resolution across your
                monitored networks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Back to dashboard
              </Link>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              onClick={() => handlePresetChange('unack')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                presetFilter === 'unack'
                  ? 'bg-amber-500 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
              }`}
            >
              Not Acknowledged
            </button>
            <button
              onClick={() => handlePresetChange('all')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                presetFilter === 'all'
                  ? 'bg-cyan-500 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => handlePresetChange('ack')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                presetFilter === 'ack'
                  ? 'bg-emerald-500 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
              }`}
            >
              Acknowledged
            </button>
            <button
              onClick={() => handlePresetChange('lastrun')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                presetFilter === 'lastrun'
                  ? 'bg-violet-500 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
              }`}
            >
              Last Scan
            </button>
          </div>

          {/* Advanced Filters */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={typeFilter ?? ''}
              onChange={handleTypeFilterChange}
              className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All types</option>
              <option value="new_port">New Port</option>
              <option value="not_allowed">Not Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <select
              value={networkIdFilter ?? ''}
              onChange={handleNetworkFilterChange}
              className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All networks</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </select>

            {isAdmin && someSelected && (
              <button
                onClick={handleBulkAcknowledge}
                disabled={bulkAcknowledgeMutation.isPending}
                className="ml-auto rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/30"
              >
                {bulkAcknowledgeMutation.isPending
                  ? 'Acknowledging...'
                  : `Acknowledge (${selectedIds.size})`}
              </button>
            )}
          </div>

          {/* Action message */}
          {actionMessage && (
            <div className="mt-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
              {actionMessage}
            </div>
          )}

          {hasError ? (
            <div className="mt-6 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load alerts right now.
            </div>
          ) : null}

          {/* Alerts table */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200/70 bg-slate-50/80 text-left text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300">
                  {isAdmin && (
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allUnacknowledgedSelected}
                        onChange={handleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-600 dark:bg-slate-800"
                        title="Select all unacknowledged"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Network</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Port</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 7 : 6}
                      className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400"
                    >
                      Loading alerts...
                    </td>
                  </tr>
                ) : alerts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 7 : 6}
                      className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400"
                    >
                      No alerts found.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => {
                    const alertDate = parseUtcDate(alert.created_at)
                    const relativeTime = formatRelativeTime(alertDate, now)
                    const fullTime = formatDateTime(alertDate)
                    const typeLabel = alertTypeLabels[alert.type] ?? alert.type
                    const typeStyle = alertTypeStyles[alert.type]

                    // Highlight unacknowledged alerts
                    const rowClass = alert.acknowledged
                      ? 'bg-white/60 dark:bg-slate-950/40'
                      : 'bg-amber-50/50 dark:bg-amber-950/20'

                    return (
                      <tr
                        key={alert.id}
                        className={`text-sm transition hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${rowClass}`}
                      >
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(alert.id)}
                              onChange={(e) => handleSelectOne(alert.id, e.target.checked)}
                              disabled={alert.acknowledged}
                              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-30 dark:border-slate-600 dark:bg-slate-800"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                              typeStyle ??
                              'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300'
                            }`}
                          >
                            {typeLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-900 dark:text-white">
                          {alert.network_name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                          {alert.ip}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                          {alert.port}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="text-slate-700 dark:text-slate-200">{relativeTime}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{fullTime}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isAllowed(alert) && (
                              <span className="inline-flex items-center rounded-full border border-emerald-300/60 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                                Allowed
                              </span>
                            )}
                            {isExcluded(alert) && (
                              <span className="inline-flex items-center rounded-full border border-rose-300/60 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200">
                                Excluded
                              </span>
                            )}
                            {alert.acknowledged ? (
                              isAdmin ? (
                                <button
                                  onClick={() => unacknowledgeMutation.mutate(alert.id)}
                                  disabled={unacknowledgeMutation.isPending}
                                  title="Click to reopen"
                                  className="inline-flex cursor-pointer items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:bg-emerald-500/30"
                                >
                                  Acknowledged ✓
                                </button>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                                  Acknowledged ✓
                                </span>
                              )
                            ) : isAdmin ? (
                              <button
                                onClick={() => setActionModal({ alert })}
                                className="rounded-full border border-amber-300 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-500/20 dark:border-amber-500/50 dark:text-amber-200 dark:hover:border-amber-400 dark:hover:bg-amber-500/30"
                              >
                                Resolve
                              </button>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200">
                                Pending
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Refresh indicator */}
          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Auto-refreshes every 30 seconds
            {alertsQuery.isFetching && !alertsQuery.isLoading && (
              <span className="ml-2 italic">Refreshing...</span>
            )}
          </div>
        </div>
      </section>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200/70 bg-white p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Resolve Alert
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {actionModal.alert.ip}:{actionModal.alert.port}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {actionModal.alert.network_name}
                </p>
              </div>
              <button
                onClick={() => {
                  setActionModal(null)
                  setExcludeReason('')
                }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              How do you want to handle this alert?
            </p>

            <div className="space-y-3">
              {/* Acknowledge Only */}
              <button
                onClick={handleAcknowledgeOnly}
                disabled={
                  acknowledgeMutation.isPending ||
                  whitelistMutation.isPending ||
                  excludeMutation.isPending
                }
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">Acknowledge only</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mark as reviewed, keep monitoring this port
                  </p>
                </div>
              </button>

              {/* Whitelist */}
              <button
                onClick={handleWhitelist}
                disabled={
                  acknowledgeMutation.isPending ||
                  whitelistMutation.isPending ||
                  excludeMutation.isPending
                }
                className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-emerald-700 dark:text-emerald-200">
                    Whitelist this port
                  </p>
                  <p className="text-xs text-emerald-600/80 dark:text-emerald-300/70">
                    Mark as expected, won't trigger future alerts
                  </p>
                </div>
              </button>

              {/* Exclude */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-rose-700 dark:text-rose-200">
                      Exclude from scans
                    </p>
                    <p className="text-xs text-rose-600/80 dark:text-rose-300/70">
                      Hide completely, won't appear in results
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <input
                    type="text"
                    value={excludeReason}
                    onChange={(e) => setExcludeReason(e.target.value)}
                    placeholder="Reason for exclusion (required)"
                    className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none dark:border-rose-500/40 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <button
                  onClick={handleExclude}
                  disabled={
                    !excludeReason.trim() ||
                    acknowledgeMutation.isPending ||
                    whitelistMutation.isPending ||
                    excludeMutation.isPending
                  }
                  className="mt-3 w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-600"
                >
                  Exclude
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Alerts
