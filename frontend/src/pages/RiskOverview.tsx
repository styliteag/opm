import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AlertComments from '../components/AlertComments'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type { Alert, AlertListResponse, NetworkListResponse, PolicyListResponse, GlobalOpenPort, GlobalOpenPortListResponse, UserListResponse, ResolutionStatus } from '../types'

const formatDateTime = (value: Date) =>
    new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(value)

const parseUtcDate = (dateStr: string) => new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

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

const getServiceName = (serviceGuess: string | null | undefined, banner: string | null | undefined): string => {
    // Use service_guess if available
    if (serviceGuess) return serviceGuess
    // Fall back to first word of banner (e.g., "http" from "http Golang net/http server")
    if (banner) {
        const firstWord = banner.split(' ')[0]
        if (firstWord) return firstWord
    }
    return 'Unknown Service'
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

const resolutionStatusLabels: Record<ResolutionStatus, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
}

const resolutionStatusStyles: Record<ResolutionStatus, string> = {
    open: 'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:text-amber-200',
    in_progress: 'border-blue-300/50 bg-blue-500/15 text-blue-700 dark:text-blue-200',
    resolved: 'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200',
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
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'blocked' | 'pending' | 'approved' | 'monitoring'
    >('all')
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
    const [editingComment, setEditingComment] = useState<{ hostId: number; comment: string; ip: string } | null>(null)
    const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortColumn, setSortColumn] = useState<'severity' | 'ip' | 'port' | 'network' | 'time'>('time')
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
    const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [assignedUserFilter, setAssignedUserFilter] = useState<number | 'all' | 'unassigned'>('all')
    const [resolutionStatusFilter, setResolutionStatusFilter] = useState<ResolutionStatus | 'all'>('all')
    const [assignDropdownOpen, setAssignDropdownOpen] = useState<number | null>(null)
    const [statusDropdownOpen, setStatusDropdownOpen] = useState<number | null>(null)
    const [updatingAssignment, setUpdatingAssignment] = useState<number | null>(null)
    const [updatingStatus, setUpdatingStatus] = useState<number | null>(null)
    const now = new Date()

    const isAdmin = user?.role === 'admin'

    useEffect(() => {
        if (!toast) return
        const t = setTimeout(() => setToast(null), 3000)
        return () => clearTimeout(t)
    }, [toast])

    // Fetch alerts
    const alertsQuery = useQuery({
        queryKey: ['alerts', 'all'],
        queryFn: () => fetchJson<AlertListResponse>('/api/alerts?limit=200', token ?? ''),
        enabled: Boolean(token),
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

    // Fetch global ports for details
    const globalPortsQuery = useQuery({
        queryKey: ['global-ports'],
        queryFn: () => fetchJson<GlobalOpenPortListResponse>('/api/global-ports', token ?? ''),
        enabled: Boolean(token),
    })

    // Fetch users for assignment dropdown
    const usersQuery = useQuery({
        queryKey: ['users'],
        queryFn: () => fetchJson<UserListResponse>('/api/users', token ?? ''),
        enabled: Boolean(token),
    })

    const alerts = useMemo(() => alertsQuery.data?.alerts ?? [], [alertsQuery.data?.alerts])
    const networks = useMemo(() => networksQuery.data?.networks ?? [], [networksQuery.data?.networks])
    const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users])

    // Build port lookup map
    const portMap = useMemo(() => {
        const map = new Map<number, GlobalOpenPort>()
        for (const port of globalPortsQuery.data?.ports ?? []) {
            map.set(port.id, port)
        }
        return map
    }, [globalPortsQuery.data?.ports])

    // Build allowed/blocked sets
    const allowedSets = useMemo(() => {
        const rules = policyQuery.data?.rules ?? []
        const sets = {
            ipKeys: new Set<string>(),
            networkKeys: new Set<string>(),
            globalIpKeys: new Set<string>(),
            globalPortKeys: new Set<string>(),
        }
        rules.forEach((rule) => {
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
    }, [policyQuery.data?.rules])

    const isAlertAllowed = useCallback(
        (alert: Alert) => {
            if (allowedSets.globalIpKeys.has(`${alert.ip}:${alert.port}`)) return true
            if (allowedSets.globalPortKeys.has(String(alert.port))) return true
            if (alert.network_id === null) return false
            return (
                allowedSets.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`) ||
                allowedSets.networkKeys.has(`${alert.network_id}:${alert.port}`)
            )
        },
        [allowedSets],
    )

    // Filter and sort alerts
    const filteredAlerts = useMemo(() => {
        const filtered = alerts.filter((alert) => {
            if (severityFilter && alert.severity !== severityFilter) return false
            if (networkFilter && alert.network_id !== networkFilter) return false

            // Status filter
            if (statusFilter === 'blocked' && alert.severity !== 'critical') return false
            if (statusFilter === 'pending' && alert.acknowledged) return false
            if (statusFilter === 'approved') {
                if (!isAlertAllowed(alert)) return false
            }
            if (statusFilter === 'monitoring' && (!alert.acknowledged || alert.severity === 'critical'))
                return false

            // Search filter
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase()
                const portData = alert.global_open_port_id ? portMap.get(alert.global_open_port_id) : null
                const serviceName = portData ? getServiceName(portData.service_guess, portData.banner).toLowerCase() : ''

                const matches =
                    alert.ip.toLowerCase().includes(query) ||
                    (alert.hostname && alert.hostname.toLowerCase().includes(query)) ||
                    String(alert.port).includes(query) ||
                    (alert.network_name && alert.network_name.toLowerCase().includes(query)) ||
                    serviceName.includes(query) ||
                    (portData?.banner && portData.banner.toLowerCase().includes(query))

                if (!matches) return false
            }

            // Assigned user filter
            if (assignedUserFilter !== 'all') {
                if (assignedUserFilter === 'unassigned') {
                    if (alert.assigned_to_user_id !== null) return false
                } else {
                    if (alert.assigned_to_user_id !== assignedUserFilter) return false
                }
            }

            // Resolution status filter
            if (resolutionStatusFilter !== 'all') {
                if (alert.resolution_status !== resolutionStatusFilter) return false
            }

            return true
        })

        // Sort alerts
        const severityOrder = { critical: 0, high: 1, medium: 2, info: 3 }

        // Helper function to compare IPs (supports both IPv4 and IPv6)
        const compareIPs = (ipA: string, ipB: string): number => {
            const isIPv4 = (ip: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)

            const aIsV4 = isIPv4(ipA)
            const bIsV4 = isIPv4(ipB)

            // IPv4 comes before IPv6
            if (aIsV4 && !bIsV4) return -1
            if (!aIsV4 && bIsV4) return 1

            if (aIsV4 && bIsV4) {
                // Both are IPv4 - numeric comparison
                const aParts = ipA.split('.').map(Number)
                const bParts = ipB.split('.').map(Number)
                for (let i = 0; i < 4; i++) {
                    if (aParts[i] !== bParts[i]) {
                        return aParts[i] - bParts[i]
                    }
                }
                return 0
            } else {
                // Both are IPv6 (or other format) - lexicographic comparison
                // Expand compressed IPv6 for proper comparison
                const expandIPv6 = (ip: string): string => {
                    if (!ip.includes(':')) return ip

                    // Handle :: expansion
                    if (ip.includes('::')) {
                        const sides = ip.split('::')
                        const leftParts = sides[0] ? sides[0].split(':') : []
                        const rightParts = sides[1] ? sides[1].split(':') : []
                        const missingParts = 8 - leftParts.length - rightParts.length
                        const middleParts = Array(missingParts).fill('0')
                        ip = [...leftParts, ...middleParts, ...rightParts].join(':')
                    }

                    // Pad each segment to 4 characters
                    return ip.split(':').map(seg => seg.padStart(4, '0')).join(':')
                }

                return expandIPv6(ipA).localeCompare(expandIPv6(ipB))
            }
        }

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
                case 'network': {
                    const aNetwork = a.network_name ?? ''
                    const bNetwork = b.network_name ?? ''
                    comparison = aNetwork.localeCompare(bNetwork)
                    break
                }
                case 'time': {
                    const aTime = parseUtcDate(a.created_at).getTime()
                    const bTime = parseUtcDate(b.created_at).getTime()
                    comparison = aTime - bTime
                    break
                }
            }

            return sortDirection === 'asc' ? comparison : -comparison
        })
    }, [alerts, severityFilter, networkFilter, statusFilter, searchQuery, isAlertAllowed, portMap, sortColumn, sortDirection, assignedUserFilter, resolutionStatusFilter])

    const toggleRow = (alertId: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev)
            if (next.has(alertId)) next.delete(alertId)
            else next.add(alertId)
            return next
        })
    }

    const handleSort = (column: typeof sortColumn) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortColumn(column)
            setSortDirection('asc')
        }
    }

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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
            setToast({ message: 'Comment updated', tone: 'success' })
            setEditingComment(null)
        },
        onError: (e) => setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' }),
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
            setToast({ message: 'Alert assignment updated', tone: 'success' })
            setAssignDropdownOpen(null)
            setUpdatingAssignment(null)
        },
        onError: (e) => {
            setToast({ message: e instanceof Error ? e.message : 'Failed to update assignment', tone: 'error' })
            setUpdatingAssignment(null)
        },
    })

    const updateStatusMutation = useMutation({
        mutationFn: async ({ alertId, status }: { alertId: number; status: ResolutionStatus }) => {
            const res = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
                body: JSON.stringify({ resolution_status: status }),
            })
            if (!res.ok) throw new Error(await extractErrorMessage(res))
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
            setToast({ message: 'Alert status updated', tone: 'success' })
            setStatusDropdownOpen(null)
            setUpdatingStatus(null)
        },
        onError: (e) => {
            setToast({ message: e instanceof Error ? e.message : 'Failed to update status', tone: 'error' })
            setUpdatingStatus(null)
        },
    })

    const handleAssignAlert = (alertId: number, userId: number | null) => {
        setUpdatingAssignment(alertId)
        assignAlertMutation.mutate({ alertId, userId })
    }

    const handleUpdateStatus = (alertId: number, status: ResolutionStatus) => {
        setUpdatingStatus(alertId)
        updateStatusMutation.mutate({ alertId, status })
    }

    const handleExportCsv = async () => {
        setIsExporting(true)
        setExportDropdownOpen(false)
        try {
            const queryParams = new URLSearchParams()
            if (severityFilter) queryParams.append('type', severityFilter)
            if (statusFilter === 'pending') queryParams.append('acknowledged', 'false')
            else if (statusFilter === 'monitoring') queryParams.append('acknowledged', 'true')

            const url = `${API_BASE_URL}/api/alerts/export/csv${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
            const response = await fetch(url, { headers: getAuthHeaders(token ?? '') })

            if (!response.ok) throw new Error(await extractErrorMessage(response))

            const blob = await response.blob()
            const downloadUrl = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = downloadUrl
            link.download = `alerts_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(downloadUrl)

            setToast({ message: 'Alerts exported successfully', tone: 'success' })
        } catch (error) {
            setToast({
                message: error instanceof Error ? error.message : 'Export failed',
                tone: 'error'
            })
        } finally {
            setIsExporting(false)
        }
    }

    const handleExportPdf = async () => {
        setIsExporting(true)
        setExportDropdownOpen(false)
        try {
            const queryParams = new URLSearchParams()
            if (severityFilter) queryParams.append('type', severityFilter)
            if (statusFilter === 'pending') queryParams.append('acknowledged', 'false')
            else if (statusFilter === 'monitoring') queryParams.append('acknowledged', 'true')

            const url = `${API_BASE_URL}/api/alerts/export/pdf${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
            const response = await fetch(url, { headers: getAuthHeaders(token ?? '') })

            if (!response.ok) throw new Error(await extractErrorMessage(response))

            const blob = await response.blob()
            const downloadUrl = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = downloadUrl
            link.download = `alerts_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.pdf`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(downloadUrl)

            setToast({ message: 'Alerts exported successfully', tone: 'success' })
        } catch (error) {
            setToast({
                message: error instanceof Error ? error.message : 'Export failed',
                tone: 'error'
            })
        } finally {
            setIsExporting(false)
        }
    }

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
    const allUnackSelected =
        unacknowledgedCount > 0 &&
        filteredAlerts.filter((a) => !a.acknowledged).every((a) => selectedIds.has(a.id))

    return (
        <div className="relative">
            {toast && (
                <div className="fixed top-8 right-8 z-[100] animate-in slide-in-from-top-4 duration-300">
                    <div
                        className={`px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] font-black uppercase text-xs tracking-[0.2em] border ${toast.tone === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'}`}
                    >
                        {toast.message}
                    </div>
                </div>
            )}

            <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-rose-500/15 blur-[130px]" />
            <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-amber-500/20 blur-[140px]" />

            <section className="relative z-10 space-y-8">
                <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Security Overview
                            </p>
                            <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                                Risk Overview
                            </h2>
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
                            <div className="relative">
                                <button
                                    onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                                    disabled={isExporting}
                                    className="rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isExporting ? 'Exporting...' : 'Export'}
                                </button>
                                {exportDropdownOpen && !isExporting && (
                                    <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-slate-200/70 bg-white shadow-lg dark:border-slate-800/70 dark:bg-slate-900">
                                        <button
                                            onClick={handleExportCsv}
                                            className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-t-2xl transition"
                                        >
                                            Export as CSV
                                        </button>
                                        <button
                                            onClick={handleExportPdf}
                                            className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-b-2xl transition"
                                        >
                                            Export as PDF
                                        </button>
                                    </div>
                                )}
                            </div>
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
                        <div className="relative flex-1 min-w-[240px]">
                            <svg
                                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search IP, hostname, port, network, service, banner..."
                                className="w-full rounded-2xl border border-slate-200/70 bg-white pl-10 pr-4 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            )}
                        </div>

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

                        <select
                            value={assignedUserFilter}
                            onChange={(e) => {
                                const val = e.target.value
                                if (val === 'all' || val === 'unassigned') {
                                    setAssignedUserFilter(val)
                                } else {
                                    setAssignedUserFilter(Number(val))
                                }
                            }}
                            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                            <option value="all">All Assignees</option>
                            <option value="unassigned">Unassigned</option>
                            {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.email}
                                </option>
                            ))}
                        </select>

                        <select
                            value={resolutionStatusFilter}
                            onChange={(e) => setResolutionStatusFilter(e.target.value as ResolutionStatus | 'all')}
                            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                            <option value="all">All Resolution Status</option>
                            <option value="open">🟡 Open</option>
                            <option value="in_progress">🔵 In Progress</option>
                            <option value="resolved">🟢 Resolved</option>
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
                                    <th className="w-10 px-2 py-3"></th>
                                    <th
                                        className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        onClick={() => handleSort('severity')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Severity
                                            {sortColumn === 'severity' && (
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                                </svg>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        onClick={() => handleSort('ip')}
                                    >
                                        <div className="flex items-center gap-2">
                                            IP / Hostname
                                            {sortColumn === 'ip' && (
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                                </svg>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        onClick={() => handleSort('port')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Port
                                            {sortColumn === 'port' && (
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                                </svg>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        onClick={() => handleSort('network')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Network
                                            {sortColumn === 'network' && (
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                                </svg>
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        onClick={() => handleSort('time')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Time
                                            {sortColumn === 'time' && (
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                                </svg>
                                            )}
                                        </div>
                                    </th>
                                    <th className="px-4 py-3">Assigned To</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                                {alertsQuery.isLoading || policyQuery.isLoading ? (
                                    <tr>
                                        <td colSpan={isAdmin ? 11 : 10} className="px-4 py-6 text-sm text-slate-500">
                                            Loading security context...
                                        </td>
                                    </tr>
                                ) : filteredAlerts.length === 0 ? (
                                    <tr>
                                        <td colSpan={isAdmin ? 11 : 10} className="px-4 py-6 text-sm text-slate-500">
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
                                        const isExpanded = expandedRows.has(alert.id)
                                        const portData = alert.global_open_port_id ? portMap.get(alert.global_open_port_id) : null

                                        return (
                                            <React.Fragment key={alert.id}>
                                                <tr
                                                    onClick={() => toggleRow(alert.id)}
                                                    className={`text-sm transition cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${alert.acknowledged ? 'opacity-60' : ''}`}
                                                >
                                                    {isAdmin && (
                                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedIds.has(alert.id)}
                                                                onChange={(e) => handleSelectOne(alert.id, e.target.checked)}
                                                                disabled={alert.acknowledged}
                                                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-30"
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="px-2 py-3">
                                                        <svg
                                                            className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${severityStyle}`}
                                                        >
                                                            {severityLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-mono text-slate-600 dark:text-slate-300">
                                                            {alert.ip}
                                                        </p>
                                                        {alert.hostname && (
                                                            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                                                                {alert.hostname}
                                                            </p>
                                                        )}
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
                                                    {/* Assigned To column */}
                                                    <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setAssignDropdownOpen(assignDropdownOpen === alert.id ? null : alert.id)}
                                                                disabled={updatingAssignment === alert.id}
                                                                className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                                                            >
                                                                {updatingAssignment === alert.id ? (
                                                                    <span className="animate-pulse">Updating...</span>
                                                                ) : alert.assigned_to_email ? (
                                                                    <span className="max-w-[100px] truncate">{alert.assigned_to_email}</span>
                                                                ) : (
                                                                    <span className="text-slate-400">Unassigned</span>
                                                                )}
                                                                <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                            </button>
                                                            {assignDropdownOpen === alert.id && (
                                                                <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200/70 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                                                    <button
                                                                        onClick={() => handleAssignAlert(alert.id, null)}
                                                                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-t-xl transition"
                                                                    >
                                                                        Unassigned
                                                                    </button>
                                                                    {users.map((u) => (
                                                                        <button
                                                                            key={u.id}
                                                                            onClick={() => handleAssignAlert(alert.id, u.id)}
                                                                            className={`w-full px-3 py-2 text-left text-xs font-medium transition hover:bg-slate-100 dark:hover:bg-slate-700 last:rounded-b-xl ${alert.assigned_to_user_id === u.id ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}
                                                                        >
                                                                            {u.email}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* Status column */}
                                                    <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setStatusDropdownOpen(statusDropdownOpen === alert.id ? null : alert.id)}
                                                                disabled={updatingStatus === alert.id}
                                                                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${resolutionStatusStyles[alert.resolution_status]} disabled:opacity-50`}
                                                            >
                                                                {updatingStatus === alert.id ? (
                                                                    <span className="animate-pulse">Updating...</span>
                                                                ) : (
                                                                    resolutionStatusLabels[alert.resolution_status]
                                                                )}
                                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                            </button>
                                                            {statusDropdownOpen === alert.id && (
                                                                <div className="absolute left-0 top-full z-30 mt-1 w-36 rounded-xl border border-slate-200/70 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                                                    {(['open', 'in_progress', 'resolved'] as ResolutionStatus[]).map((status) => (
                                                                        <button
                                                                            key={status}
                                                                            onClick={() => handleUpdateStatus(alert.id, status)}
                                                                            className={`w-full px-3 py-2 text-left text-xs font-medium transition hover:bg-slate-100 dark:hover:bg-slate-700 first:rounded-t-xl last:rounded-b-xl ${alert.resolution_status === status ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
                                                                        >
                                                                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${resolutionStatusStyles[status]}`}>
                                                                                {resolutionStatusLabels[status]}
                                                                            </span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                        {alert.acknowledged ? (
                                                            <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                                                                Acknowledged
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
                                                {isExpanded && (
                                                    <tr className="bg-slate-50/20 dark:bg-slate-800/10">
                                                        <td colSpan={isAdmin ? 11 : 10} className="px-16 py-12">
                                                            {portData ? (
                                                                <div className="space-y-8">
                                                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                                                                        <div className="space-y-8">
                                                                            <div>
                                                                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.25em] mb-2">
                                                                                    Service Detection
                                                                                </p>
                                                                                <p className="text-lg font-black text-slate-900 dark:text-white">
                                                                                    {getServiceName(portData.service_guess, portData.banner)}
                                                                                </p>
                                                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                                                    Protocol: {portData.protocol.toUpperCase()}
                                                                                </p>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                                                                                <div>
                                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                                                                                        First Seen
                                                                                    </p>
                                                                                    <p className="text-xs font-black text-slate-700 dark:text-slate-300">
                                                                                        {formatDateTime(parseUtcDate(portData.first_seen_at))}
                                                                                    </p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                                                                                        Last Seen
                                                                                    </p>
                                                                                    <p className="text-xs font-black text-slate-700 dark:text-slate-300">
                                                                                        {formatDateTime(parseUtcDate(portData.last_seen_at))}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="border-l border-slate-100 dark:border-slate-800/50 pl-12">
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
                                                                                    Host Comment
                                                                                </p>
                                                                                {isAdmin && alert.host_id && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            setEditingComment({
                                                                                                hostId: alert.host_id!,
                                                                                                comment: alert.user_comment || '',
                                                                                                ip: alert.ip,
                                                                                            })
                                                                                        }}
                                                                                        className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                                                                                    >
                                                                                        Edit
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                                                                                {alert.user_comment || 'No comment'}
                                                                            </p>
                                                                            {alert.hostname && (
                                                                                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">
                                                                                        Hostname
                                                                                    </p>
                                                                                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                                                                        {alert.hostname}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="border-l border-slate-100 dark:border-slate-800/50 pl-12">
                                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">
                                                                                Application Banner
                                                                            </p>
                                                                            <div className="bg-slate-950 rounded-2xl p-6 overflow-hidden border border-slate-800 relative group/code shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]">
                                                                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 opacity-60" />
                                                                                <pre className="text-[11px] font-mono text-emerald-400/80 whitespace-pre-wrap leading-loose select-all italic">
                                                                                    {portData.banner || 'NO PAYLOAD DATA DETECTED'}
                                                                                </pre>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {/* Alert Comments Section */}
                                                                    <div className="pt-8 border-t border-slate-100 dark:border-slate-800/50">
                                                                        <AlertComments
                                                                            alertId={alert.id}
                                                                            onToast={(message, tone) => setToast({ message, tone })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-8">
                                                                    <div className="flex items-start gap-8">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
                                                                                    Host Comment
                                                                                </p>
                                                                                {isAdmin && alert.host_id && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            setEditingComment({
                                                                                                hostId: alert.host_id!,
                                                                                                comment: alert.user_comment || '',
                                                                                                ip: alert.ip,
                                                                                            })
                                                                                        }}
                                                                                        className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                                                                                    >
                                                                                        Edit
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                                                                                {alert.user_comment || 'No comment'}
                                                                            </p>
                                                                            {alert.hostname && (
                                                                                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">
                                                                                        Hostname
                                                                                    </p>
                                                                                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                                                                        {alert.hostname}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-center py-4 flex-1">
                                                                            <p className="text-slate-500 dark:text-slate-400">
                                                                                No port data available for this alert
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    {/* Alert Comments Section */}
                                                                    <div className="pt-8 border-t border-slate-100 dark:border-slate-800/50">
                                                                        <AlertComments
                                                                            alertId={alert.id}
                                                                            onToast={(message, tone) => setToast({ message, tone })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
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
                            Choose how to handle {actionModal.mode === 'bulk' ? 'these ports' : 'this port'}. A
                            justification is required for adding new rules:
                        </p>

                        <div className="mb-6 space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Justification / Reason
                            </label>
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
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-100 dark:border-slate-800"></div>
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-white px-3 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 dark:bg-slate-900">
                                        Alternative
                                    </span>
                                </div>
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
                                    <p className="font-medium text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                        Just Acknowledge
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Mark as reviewed without any rule updates
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comment Edit Modal */}
            {editingComment && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4 animate-in fade-in duration-500">
                    <div className="bg-white dark:bg-slate-900 p-16 rounded-[4rem] w-full max-w-2xl border border-slate-100 dark:border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-500">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
                            Edit Host Comment
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                            Host: <span className="font-mono text-indigo-600 dark:text-indigo-400">{editingComment.ip}</span>
                        </p>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                updateCommentMutation.mutate({
                                    hostId: editingComment.hostId,
                                    comment: editingComment.comment.trim() || null,
                                })
                            }}
                            className="mt-8 space-y-6"
                        >
                            <textarea
                                value={editingComment.comment}
                                onChange={(e) =>
                                    setEditingComment({ ...editingComment, comment: e.target.value })
                                }
                                placeholder="Add a comment about this host..."
                                className="w-full border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl px-6 py-4 text-sm font-medium focus:ring-4 ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all min-h-32"
                            />
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingComment(null)}
                                    className="text-[11px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-[0.2em] transition-all px-4"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={updateCommentMutation.isPending}
                                    className="flex-1 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {updateCommentMutation.isPending ? 'Saving...' : 'Save Comment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RiskOverview
