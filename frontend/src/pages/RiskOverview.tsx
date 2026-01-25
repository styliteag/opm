import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type {
    Alert,
    AlertListResponse,
    NetworkListResponse,
    PolicyListResponse,
} from '../types'

const formatDateTime = (value: Date) =>
    new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(value)

const parseUtcDate = (dateStr: string) =>
    new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

const formatRelativeTime = (value: Date, now: Date) => {
    const diffMs = now.getTime() - value.getTime()
    if (diffMs < 0) return 'Just now'
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

type Severity = 'critical' | 'high' | 'medium' | 'info'

const severityStyles: Record<Severity, string> = {
    critical: 'border-rose-500/50 bg-rose-500/20 text-rose-700 dark:text-rose-200',
    high: 'border-orange-400/50 bg-orange-500/15 text-orange-700 dark:text-orange-200',
    medium: 'border-amber-400/50 bg-amber-500/15 text-amber-700 dark:text-amber-200',
    info: 'border-slate-300/50 bg-slate-200/40 text-slate-600 dark:text-slate-300',
}

const severityLabels: Record<Severity, string> = {
    critical: '🔴 Critical',
    high: '🟠 High',
    medium: '🟡 Medium',
    info: '🔵 Info',
}

type ActionModalState = {
    alerts: Alert[]
    mode: 'single' | 'bulk'
} | null

const RiskOverview = () => {
    const { token, user } = useAuth()
    const queryClient = useQueryClient()
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [actionModal, setActionModal] = useState<ActionModalState>(null)
    const [whitelistReason, setWhitelistReason] = useState('')
    const [actionMessage, setActionMessage] = useState<string | null>(null)
    const [severityFilter, setSeverityFilter] = useState<Severity | ''>('')
    const [networkFilter, setNetworkFilter] = useState<number | null>(null)
    const [statusFilter, setStatusFilter] = useState<'all' | 'blocked' | 'pending' | 'approved' | 'monitoring'>('all')
    const now = new Date()

    const isAdmin = user?.role === 'admin'

    // Fetch alerts
    const alertsQuery = useQuery({
        queryKey: ['alerts', 'all'],
        queryFn: () => fetchJson<AlertListResponse>('/api/alerts?limit=200', token ?? ''),
        enabled: Boolean(token),
        refetchInterval: 30000,
    })

    // Fetch networks
    const networksQuery = useQuery({
        queryKey: ['networks'],
        queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
        enabled: Boolean(token),
    })

    // Fetch policy rules
    const policyQuery = useQuery({
        queryKey: ['policy'],
        queryFn: () => fetchJson<PolicyListResponse>('/api/policy', token ?? ''),
        enabled: Boolean(token),
    })

    const alerts = alertsQuery.data?.alerts ?? []
    const networks = networksQuery.data?.networks ?? []
    const policyRules = policyQuery.data?.rules ?? []

    // Build allowed/blocked sets
    const allowedSets = useMemo(() => {
        const sets = {
            ipKeys: new Set<string>(),
            networkKeys: new Set<string>(),
            globalIpKeys: new Set<string>(),
            globalPortKeys: new Set<string>(),
        }
        policyRules.forEach((rule) => {
            if (rule.rule_type !== 'allow') return
            if (rule.network_id === null) {
                if (rule.ip) sets.globalIpKeys.add(`${rule.ip}:${rule.port}`)
                else sets.globalPortKeys.add(rule.port)
            } else {
                if (rule.ip) sets.ipKeys.add(`${rule.network_id}:${rule.ip}:${rule.port}`)
                else sets.networkKeys.add(`${rule.network_id}:${rule.port}`)
            }
        })
        return sets
    }, [policyRules])

    const isAlertAllowed = (alert: Alert) => {
        if (allowedSets.globalIpKeys.has(`${alert.ip}:${alert.port}`)) return true
        if (allowedSets.globalPortKeys.has(String(alert.port))) return true
        if (alert.network_id === null) return false
        return allowedSets.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`) ||
            allowedSets.networkKeys.has(`${alert.network_id}:${alert.port}`)
    }

    // Filter alerts
    const filteredAlerts = useMemo(() => {
        return alerts.filter((alert) => {
            if (severityFilter && alert.severity !== severityFilter) return false
            if (networkFilter && alert.network_id !== networkFilter) return false

            // Status filter
            if (statusFilter === 'blocked' && alert.severity !== 'critical') return false
            if (statusFilter === 'pending' && alert.acknowledged) return false
            if (statusFilter === 'approved') {
                if (!isAlertAllowed(alert)) return false
            }
            if (statusFilter === 'monitoring' && (!alert.acknowledged || alert.severity === 'critical')) return false

            return true
        })
    }, [alerts, severityFilter, networkFilter, statusFilter, allowedSets])

    // Policy mutations
    const bulkWhitelistGlobalMutation = useMutation({
        mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason: string }) => {
            const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-whitelist-global`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(token ?? ''),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ alert_ids: alertIds, reason }),
            })
            if (!response.ok) throw new Error(await extractErrorMessage(response))
            return response.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
            queryClient.invalidateQueries({ queryKey: ['policy'] })
            setActionModal(null)
            setWhitelistReason('')
            setSelectedIds(new Set())
            setActionMessage('Rules committed and alerts acknowledged.')
            setTimeout(() => setActionMessage(null), 3000)
        },
    })

    const bulkWhitelistNetworkMutation = useMutation({
        mutationFn: async ({ alertIds, reason }: { alertIds: number[]; reason: string }) => {
            const response = await fetch(`${API_BASE_URL}/api/alerts/bulk-whitelist-network`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(token ?? ''),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ alert_ids: alertIds, reason }),
            })
            if (!response.ok) throw new Error(await extractErrorMessage(response))
            return response.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
            queryClient.invalidateQueries({ queryKey: ['policy'] })
            setActionModal(null)
            setWhitelistReason('')
            setSelectedIds(new Set())
            setActionMessage('Rules committed per network and alerts acknowledged.')
            setTimeout(() => setActionMessage(null), 3000)
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
            if (!response.ok) throw new Error(await extractErrorMessage(response))
            return response.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
            setActionModal(null)
            setSelectedIds(new Set())
            setActionMessage('Alerts acknowledged.')
            setTimeout(() => setActionMessage(null), 3000)
        },
    })

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const unackIds = filteredAlerts.filter((a) => !a.acknowledged).map((a) => a.id)
            setSelectedIds(new Set(unackIds))
        } else {
            setSelectedIds(new Set())
        }
    }

    const handleSelectOne = (alertId: number, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (checked) next.add(alertId)
            else next.delete(alertId)
            return next
        })
    }

    const handleResolve = (alert: Alert) => {
        setActionModal({ alerts: [alert], mode: 'single' })
    }

    const handleBulkResolve = () => {
        const selectedAlerts = alerts.filter((a) => selectedIds.has(a.id))
        setActionModal({ alerts: selectedAlerts, mode: 'bulk' })
    }

    const handleWhitelistGlobal = () => {
        if (!actionModal || !whitelistReason.trim()) return
        const alertIds = actionModal.alerts.map((a) => a.id)
        bulkWhitelistGlobalMutation.mutate({ alertIds, reason: whitelistReason })
    }

    const handleWhitelistNetwork = () => {
        if (!actionModal || !whitelistReason.trim()) return
        const alertIds = actionModal.alerts.map((a) => a.id)
        bulkWhitelistNetworkMutation.mutate({ alertIds, reason: whitelistReason })
    }

    const handleAcknowledgeOnly = () => {
        if (!actionModal) return
        const alertIds = actionModal.alerts.map((a) => a.id)
        bulkAcknowledgeMutation.mutate(alertIds)
    }

    const unacknowledgedCount = filteredAlerts.filter((a) => !a.acknowledged).length
    const allUnackSelected = unacknowledgedCount > 0 && filteredAlerts.filter((a) => !a.acknowledged).every((a) => selectedIds.has(a.id))

    return (
        <div className="relative">
            <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-rose-500/15 blur-[130px]" />
            <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-amber-500/20 blur-[140px]" />

            <section className="relative z-10 space-y-8">
                <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Security Overview
                            </p>
                            <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">Risk Overview</h2>
                            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                                Unified view of all security alerts and open ports across your monitored networks.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {isAdmin && selectedIds.size > 0 && (
                                <button
                                    onClick={handleBulkResolve}
                                    className="rounded-full border border-indigo-200 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300"
                                >
                                    Resolve ({selectedIds.size})
                                </button>
                            )}
                            <Link
                                to="/policy"
                                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                            >
                                Policy
                            </Link>
                            <Link
                                to="/"
                                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                            >
                                Back to dashboard
                            </Link>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                            <option value="all">All Status</option>
                            <option value="blocked">🔴 Blocked</option>
                            <option value="pending">⏳ Pending Review</option>
                            <option value="approved">✅ Approved</option>
                            <option value="monitoring">👁️ Monitoring</option>
                        </select>

                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value as Severity | '')}
                            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                            <option value="">All Severity</option>
                            <option value="critical">🔴 Critical</option>
                            <option value="high">🟠 High</option>
                            <option value="medium">🟡 Medium</option>
                            <option value="info">🔵 Info</option>
                        </select>

                        <select
                            value={networkFilter ?? ''}
                            onChange={(e) => setNetworkFilter(e.target.value ? Number(e.target.value) : null)}
                            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                            <option value="">All Networks</option>
                            {networks.map((network) => (
                                <option key={network.id} value={network.id}>
                                    {network.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Action message */}
                    {actionMessage && (
                        <div className="mt-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
                            {actionMessage}
                        </div>
                    )}

                    {/* Alerts table */}
                    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200/70 bg-slate-50/80 text-left text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300">
                                    {isAdmin && (
                                        <th className="w-10 px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={allUnackSelected}
                                                onChange={handleSelectAll}
                                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                                title="Select all unacknowledged"
                                            />
                                        </th>
                                    )}
                                    <th className="px-4 py-3">Severity</th>
                                    <th className="px-4 py-3">IP</th>
                                    <th className="px-4 py-3">Port</th>
                                    <th className="px-4 py-3">Network</th>
                                    <th className="px-4 py-3">Time</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                                {alertsQuery.isLoading || policyQuery.isLoading ? (
                                    <tr>
                                        <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-sm text-slate-500">
                                            Loading security context...
                                        </td>
                                    </tr>
                                ) : filteredAlerts.length === 0 ? (
                                    <tr>
                                        <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-sm text-slate-500">
                                            No alerts found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAlerts.map((alert) => {
                                        const alertDate = parseUtcDate(alert.created_at)
                                        const relativeTime = formatRelativeTime(alertDate, now)
                                        const fullTime = formatDateTime(alertDate)
                                        const severity = alert.severity as Severity
                                        const severityStyle = severityStyles[severity]
                                        const severityLabel = severityLabels[severity]

                                        return (
                                            <tr
                                                key={alert.id}
                                                className={`text-sm transition hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${alert.acknowledged ? 'opacity-60' : ''
                                                    }`}
                                            >
                                                {isAdmin && (
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(alert.id)}
                                                            onChange={(e) => handleSelectOne(alert.id, e.target.checked)}
                                                            disabled={alert.acknowledged}
                                                            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-30"
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${severityStyle}`}
                                                    >
                                                        {severityLabel}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                                                    {alert.ip}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                                                    {alert.port}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-slate-900 dark:text-white">
                                                    {alert.network_name ?? <span className="text-slate-400">Global</span>}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3">
                                                    <p className="text-slate-700 dark:text-slate-200">{relativeTime}</p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">{fullTime}</p>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right">
                                                    {alert.acknowledged ? (
                                                        <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                                                            Acknowledged ✓
                                                        </span>
                                                    ) : isAdmin ? (
                                                        <button
                                                            onClick={() => handleResolve(alert)}
                                                            className="rounded-full border border-amber-300 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-500/20 dark:text-amber-200"
                                                        >
                                                            Resolve
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
                                                            Pending
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Auto-refresh indicator */}
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
                                    Resolve Alert{actionModal.mode === 'bulk' ? 's' : ''}
                                </p>
                                <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                                    {actionModal.mode === 'bulk'
                                        ? `${actionModal.alerts.length} alerts selected`
                                        : 'Target Host and Port'}
                                </h3>
                                {actionModal.mode === 'single' && (
                                    <p className="mt-2 font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                                        {actionModal.alerts[0].ip}:{actionModal.alerts[0].port}
                                    </p>
                                )}
                                {actionModal.mode === 'bulk' && (
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                        Targeting {actionModal.alerts.length} unique host:port combinations
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    setActionModal(null)
                                    setWhitelistReason('')
                                }}
                                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                            Choose how to handle {actionModal.mode === 'bulk' ? 'these ports' : 'this port'}. A justification is required for adding new rules:
                        </p>

                        <div className="mb-6 space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Justification / Reason</label>
                            <input
                                type="text"
                                autoFocus
                                value={whitelistReason}
                                onChange={(e) => setWhitelistReason(e.target.value)}
                                placeholder="e.g. Authorized customer API, internal management service..."
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
                            />
                        </div>

                        <div className="space-y-3">
                            {/* Add Global Rule */}
                            <div className="group rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 transition-all hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                                        ✅
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-emerald-700 dark:text-emerald-200">
                                            Grant Global Authorization
                                        </p>
                                        <p className="text-xs text-emerald-600/80 dark:text-emerald-300/70">
                                            Apply rule to all networks
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleWhitelistGlobal}
                                    disabled={!whitelistReason.trim() || bulkWhitelistGlobalMutation.isPending}
                                    className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-emerald-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                                >
                                    {bulkWhitelistGlobalMutation.isPending ? 'Processing...' : 'Add Global Rule'}
                                </button>
                            </div>

                            {/* Add Network Rule */}
                            <div className="group rounded-xl border border-blue-200 bg-blue-50/50 p-4 transition-all hover:bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/5 dark:hover:bg-blue-500/10">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                                        📍
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-blue-700 dark:text-blue-200">
                                            Network Specific Authorization
                                        </p>
                                        <p className="text-xs text-blue-600/80 dark:text-blue-300/70">
                                            {actionModal.mode === 'single' && actionModal.alerts[0].network_name
                                                ? `Apply only to ${actionModal.alerts[0].network_name}`
                                                : 'Apply to specific networks only'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleWhitelistNetwork}
                                    disabled={!whitelistReason.trim() || bulkWhitelistNetworkMutation.isPending}
                                    className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                                >
                                    {bulkWhitelistNetworkMutation.isPending ? 'Processing...' : 'Add Network Rule'}
                                </button>
                            </div>

                            <div className="relative py-2">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-slate-800"></div></div>
                                <div className="relative flex justify-center"><span className="bg-white px-3 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 dark:bg-slate-900">Alternative</span></div>
                            </div>

                            {/* Just Reviewed */}
                            <button
                                onClick={handleAcknowledgeOnly}
                                disabled={bulkAcknowledgeMutation.isPending}
                                className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600 dark:bg-slate-800">
                                    👁️
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Just Acknowledge</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Mark as reviewed without any rule updates
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RiskOverview
