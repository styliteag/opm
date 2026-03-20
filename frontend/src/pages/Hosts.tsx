import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import { Toast } from '../components/Toast'
import { useToast } from '../lib/useToast'
import { downloadBlob, timestampedFilename } from '../lib/downloadBlob'
import type {
  BulkDeleteHostsResponse,
  Host,
  HostListResponse,
  HostOpenPortListResponse,
  NetworkListResponse,
  TriggerHostDiscoveryResponse,
} from '../types'
import { parseUtcDate, formatDateTime } from '../lib/formatters'

type SortKey = 'ip' | 'hostname' | 'last_seen_at' | 'first_seen_at'
type SortDirection = 'asc' | 'desc'

const compressIpv6 = (value: string) => {
  const lower = value.toLowerCase()
  if (!lower.includes(':') || lower.includes('.')) return value
  const parts = lower.split('::')
  if (parts.length > 2) return value
  const left = parts[0] ? parts[0].split(':') : []
  const right = parts.length === 2 && parts[1] ? parts[1].split(':') : []
  if (parts.length === 1) {
    if (left.length !== 8) return value
  } else {
    const missing = 8 - (left.length + right.length)
    if (missing < 0) return value
    left.push(...Array(missing).fill('0'))
    left.push(...right)
  }
  const normalized = left.map((s) => s.replace(/^0+(?=[0-9a-f])/i, '') || '0')
  let bestStart = -1,
    bestLen = 0,
    currentStart = -1,
    currentLen = 0
  normalized.forEach((s, i) => {
    if (s === '0') {
      if (currentStart === -1) {
        currentStart = i
        currentLen = 1
      } else currentLen++
    } else {
      if (currentLen > bestLen) {
        bestLen = currentLen
        bestStart = currentStart
      }
      currentStart = -1
      currentLen = 0
    }
  })
  if (currentLen > bestLen) {
    bestLen = currentLen
    bestStart = currentStart
  }
  if (bestLen < 2) return normalized.join(':')
  const compressed = [...normalized]
  compressed.splice(bestStart, bestLen, '')
  let res = compressed.join(':')
  if (res === '') return '::'
  if (res.startsWith(':')) res = ':' + res
  if (res.endsWith(':')) res = res + ':'
  return res
}

const formatIpAddress = (val: string) => (val.includes(':') ? compressIpv6(val) : val)

const Hosts = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialIp = searchParams.get('ip') ?? ''
  const [searchTerm, setSearchTerm] = useState(initialIp)
  const [networkFilter, setNetworkFilter] = useState<number | null>(null)
  const [pingableFilter, setPingableFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('last_seen_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(64)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [selectedHosts, setSelectedHosts] = useState<Set<number>>(new Set())
  const [discoveryNetworkId, setDiscoveryNetworkId] = useState<number | null>(null)
  const [editingComment, setEditingComment] = useState<{ hostId: number; comment: string } | null>(
    null,
  )
  const { toast, showToast } = useToast()
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (searchParams.has('ip')) {
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setOffset(0)
    setSelectedHosts(new Set())
  }, [searchTerm, networkFilter, pingableFilter, sortKey, sortDirection, limit])

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: !!token,
  })

  const hostsQuery = useQuery({
    queryKey: [
      'hosts',
      searchTerm,
      networkFilter,
      pingableFilter,
      sortKey,
      sortDirection,
      offset,
      limit,
    ],
    queryFn: () => {
      const p = new URLSearchParams()
      if (searchTerm.trim()) p.set('ip_search', searchTerm.trim())
      if (networkFilter) p.set('network_id', String(networkFilter))
      if (pingableFilter === 'yes') p.set('is_pingable', 'true')
      else if (pingableFilter === 'no') p.set('is_pingable', 'false')
      p.set('sort_by', sortKey)
      p.set('sort_dir', sortDirection)
      p.set('offset', String(offset))
      p.set('limit', String(limit))
      return fetchJson<HostListResponse>(`/api/hosts?${p.toString()}`, token ?? '')
    },
    enabled: !!token,
  })

  const hosts = useMemo(() => hostsQuery.data?.hosts ?? [], [hostsQuery.data])
  const totalCount = hostsQuery.data?.total_count ?? 0
  const pingableCount = hostsQuery.data?.pingable_count ?? 0
  const networkMap = useMemo(
    () => new Map((networksQuery.data?.networks ?? []).map((n) => [n.id, n.name])),
    [networksQuery.data],
  )

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
      queryClient.invalidateQueries({ queryKey: ['hosts'] })
      showToast('Comment updated', 'success')
      setEditingComment(null)
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (hostIds: number[]) => {
      const res = await fetch(`${API_BASE_URL}/api/hosts/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify({ host_ids: hostIds }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json() as Promise<BulkDeleteHostsResponse>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] })
      setSelectedHosts(new Set())
      setDeleteConfirm(false)
      showToast(`Deleted ${data.deleted_count} hosts`, 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
  })

  const triggerDiscoveryMutation = useMutation({
    mutationFn: async (networkId: number) => {
      const res = await fetch(`${API_BASE_URL}/api/networks/${networkId}/discover-hosts`, {
        method: 'POST',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json() as Promise<TriggerHostDiscoveryResponse>
    },
    onSuccess: () => {
      showToast('Host discovery scan started', 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
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
    onSuccess: (_, hostIp) => {
      showToast(`Rescan started for ${hostIp}`, 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
  })

  const toggleExpanded = (id: number) =>
    setExpandedRows((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const toggleSelected = (id: number) =>
    setSelectedHosts((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const toggleSelectAll = () => {
    if (selectedHosts.size === hosts.length) {
      setSelectedHosts(new Set())
    } else {
      setSelectedHosts(new Set(hosts.map((h) => h.id)))
    }
  }

  const handleExportCsv = async () => {
    setIsExporting(true)
    setIsExportDropdownOpen(false)
    try {
      const params = new URLSearchParams()
      if (networkFilter) params.set('network_id', String(networkFilter))
      if (pingableFilter === 'yes') params.set('status', 'true')
      else if (pingableFilter === 'no') params.set('status', 'false')

      const url = `${API_BASE_URL}/api/hosts/export/csv?${params.toString()}`
      const response = await fetch(url, {
        headers: getAuthHeaders(token ?? ''),
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const blob = await response.blob()
      downloadBlob(blob, timestampedFilename('hosts', 'csv'))
      showToast('CSV export successful', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Export failed', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPdf = async () => {
    setIsExporting(true)
    setIsExportDropdownOpen(false)
    try {
      const params = new URLSearchParams()
      if (networkFilter) params.set('network_id', String(networkFilter))
      if (pingableFilter === 'yes') params.set('status', 'true')
      else if (pingableFilter === 'no') params.set('status', 'false')

      const url = `${API_BASE_URL}/api/hosts/export/pdf?${params.toString()}`
      const response = await fetch(url, {
        headers: getAuthHeaders(token ?? ''),
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const blob = await response.blob()
      downloadBlob(blob, timestampedFilename('hosts', 'pdf'))
      showToast('PDF export successful', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Export failed', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const renderSort = (label: string, key: SortKey) => (
    <button
      onClick={() => {
        if (sortKey === key) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
        else {
          setSortKey(key)
          setSortDirection('asc')
        }
      }}
      className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
    >
      {label} {sortKey === key && (sortDirection === 'asc' ? '↑' : '↓')}
    </button>
  )

  return (
    <div className="relative">
      <Toast toast={toast} />

      <div className="pointer-events-none absolute -left-16 top-8 h-64 w-64 animate-drift rounded-full bg-cyan-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-8 top-36 h-64 w-64 animate-drift rounded-full bg-emerald-500/15 blur-[140px]" />

      <section className="relative z-10 space-y-6">
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Host Discovery
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                Discovered Hosts
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Browse hosts found across your monitored networks, filter by status, and manage
                host records.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isAdmin && selectedHosts.size > 0 && (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="rounded-full border border-rose-200 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-500/20 dark:border-rose-500/40 dark:text-rose-300"
                >
                  Delete ({selectedHosts.size})
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                  disabled={isExporting}
                  aria-label="Export hosts"
                  aria-expanded={isExportDropdownOpen}
                  className="rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70 dark:border-emerald-500/40 dark:text-emerald-300 disabled:opacity-50"
                >
                  {isExporting ? 'Exporting...' : 'Export'}
                </button>
                {isExportDropdownOpen && !isExporting && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-slate-200/70 bg-white shadow-lg dark:border-slate-800/70 dark:bg-slate-900">
                    <button
                      onClick={handleExportCsv}
                      className="w-full rounded-t-2xl px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Export as CSV
                    </button>
                    <button
                      onClick={handleExportPdf}
                      className="w-full rounded-b-2xl px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Export as PDF
                    </button>
                  </div>
                )}
              </div>
              {isAdmin && (
                <>
                  <select
                    value={discoveryNetworkId ?? ''}
                    onChange={(e) =>
                      setDiscoveryNetworkId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="min-w-[200px] rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Select Network...</option>
                    {(networksQuery.data?.networks ?? []).map((n) => (
                      <option key={n.id} value={n.id} disabled={!n.host_discovery_enabled}>
                        {n.name} ({n.cidr}){!n.host_discovery_enabled ? ' - disabled' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      discoveryNetworkId && triggerDiscoveryMutation.mutate(discoveryNetworkId)
                    }
                    disabled={!discoveryNetworkId || triggerDiscoveryMutation.isPending}
                    className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {triggerDiscoveryMutation.isPending ? 'Starting...' : 'Discover Hosts'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Total Hosts
              </p>
              <p className="mt-1 text-2xl font-semibold text-cyan-600 dark:text-cyan-200">
                {totalCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pingable</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-200">
                {pingableCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70 md:col-span-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Search</p>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search IP, hostname, MAC..."
                className="mt-1 w-full border-none bg-transparent p-0 text-lg font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Network
                </span>
                <select
                  value={networkFilter ?? ''}
                  onChange={(e) => setNetworkFilter(e.target.value ? Number(e.target.value) : null)}
                  className="w-48 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">All Networks</option>
                  {(networksQuery.data?.networks ?? []).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Pingable
                </span>
                <select
                  value={pingableFilter}
                  onChange={(e) => setPingableFilter(e.target.value)}
                  className="w-32 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {totalCount} Hosts (showing {hosts.length})
              </span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value={64}>64</option>
                <option value={256}>256</option>
                <option value={512}>512</option>
                <option value={1024}>1024</option>
              </select>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Prev
                </button>
                <button
                  disabled={hosts.length < limit}
                  onClick={() => setOffset(offset + limit)}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-30 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200/70 bg-slate-50/80 dark:border-slate-800/70 dark:bg-slate-900/60">
                    {isAdmin && (
                      <th className="w-10 px-4 py-4">
                        <input
                          type="checkbox"
                          checked={hosts.length > 0 && selectedHosts.size === hosts.length}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 cursor-pointer rounded border border-slate-300 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-0 dark:border-slate-600"
                        />
                      </th>
                    )}
                    <th className="px-5 py-4">{renderSort('IP Address', 'ip')}</th>
                    <th className="px-5 py-4">{renderSort('Hostname', 'hostname')}</th>
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 dark:text-slate-300">
                      Pingable
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold text-slate-500 dark:text-slate-300">
                      MAC
                    </th>
                    <th className="px-5 py-4">{renderSort('Last Seen', 'last_seen_at')}</th>
                    {isAdmin && (
                      <th className="px-5 py-4 text-xs font-semibold text-slate-500 dark:text-slate-300">
                        Actions
                      </th>
                    )}
                    <th className="px-5 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-300">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  {hosts.map((host: Host) => {
                    const isOpen = expandedRows.has(host.id)
                    const isSelected = selectedHosts.has(host.id)
                    return (
                      <React.Fragment key={host.id}>
                        <tr
                          className={`transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60 ${isSelected ? 'bg-cyan-50/50 dark:bg-cyan-900/10' : ''}`}
                        >
                          {isAdmin && (
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(host.id)}
                                className="h-4 w-4 cursor-pointer rounded border border-slate-300 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-0 dark:border-slate-600"
                              />
                            </td>
                          )}
                          <td className="px-5 py-3 font-mono text-sm">
                            <Link
                              to={`/hosts/${host.id}`}
                              className="font-semibold text-cyan-600 hover:underline dark:text-cyan-300"
                            >
                              {formatIpAddress(host.ip)}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-400">
                            {host.hostname || '-'}
                          </td>
                          <td className="px-5 py-3">
                            {host.is_pingable === null ? (
                              <span className="text-slate-400">-</span>
                            ) : host.is_pingable ? (
                              <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                                Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-rose-300/50 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-200">
                                No
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-slate-500">
                            {host.mac_address || '-'}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">
                            {formatDateTime(parseUtcDate(host.last_seen_at))}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  rescanHostMutation.mutate(host.ip)
                                }}
                                disabled={rescanHostMutation.isPending}
                                className="rounded-full border border-cyan-200 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-500/20 dark:border-cyan-500/40 dark:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Rescan this host with nmap"
                              >
                                {rescanHostMutation.isPending ? 'Scanning...' : 'Rescan'}
                              </button>
                            </td>
                          )}
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => toggleExpanded(host.id)}
                              className={`rounded-full p-1.5 transition ${isOpen ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                            >
                              <svg
                                className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <HostDetailRow
                            host={host}
                            networkMap={networkMap}
                            isAdmin={isAdmin}
                            token={token}
                            onEditComment={(hostId, comment) =>
                              setEditingComment({ hostId, comment: comment || '' })
                            }
                            extraColSpan={isAdmin ? 2 : 0}
                          />
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur"
          role="dialog"
          aria-labelledby="delete-modal-title"
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <h3
              id="delete-modal-title"
              className="font-display text-2xl text-slate-900 dark:text-white"
            >
              Delete Hosts
            </h3>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {selectedHosts.size}
              </span>{' '}
              host{selectedHosts.size !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedHosts))}
                className="rounded-full border border-rose-600 bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingComment && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur"
          role="dialog"
          aria-labelledby="comment-modal-title"
        >
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <h3
              id="comment-modal-title"
              className="font-display text-2xl text-slate-900 dark:text-white"
            >
              Edit Host Comment
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                updateCommentMutation.mutate({
                  hostId: editingComment.hostId,
                  comment: editingComment.comment.trim() || null,
                })
              }}
              className="mt-6 space-y-4"
            >
              <textarea
                value={editingComment.comment}
                onChange={(e) => setEditingComment({ ...editingComment, comment: e.target.value })}
                placeholder="Add a comment about this host..."
                className="min-h-32 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingComment(null)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateCommentMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
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

const HostDetailRow = ({
  host,
  networkMap,
  isAdmin,
  token,
  onEditComment,
  extraColSpan = 0,
}: {
  host: Host
  networkMap: Map<number, string>
  isAdmin: boolean
  token: string | null
  onEditComment: (hostId: number, comment: string | null) => void
  extraColSpan?: number
}) => {
  const portsQuery = useQuery({
    queryKey: ['host-ports', host.id],
    queryFn: () => fetchJson<HostOpenPortListResponse>(`/api/hosts/${host.id}/ports`, token ?? ''),
    enabled: !!token,
  })

  return (
    <tr className="bg-slate-50/50 dark:bg-slate-900/30">
      <td colSpan={6 + extraColSpan} className="px-5 py-4">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          <div className="space-y-3">
            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Networks ({host.seen_by_networks.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {host.seen_by_networks.map((id: number) => (
                  <span
                    key={id}
                    className="rounded-full border border-slate-200/70 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-800/70 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {networkMap.get(id) || `Network ${id}`}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-slate-200/70 pt-2 dark:border-slate-800/70">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  First Seen
                </p>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(
                    new Date(
                      host.first_seen_at.endsWith('Z')
                        ? host.first_seen_at
                        : host.first_seen_at + 'Z',
                    ),
                  )}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Last Seen
                </p>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(
                    new Date(
                      host.last_seen_at.endsWith('Z') ? host.last_seen_at : host.last_seen_at + 'Z',
                    ),
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-l border-slate-200/70 pl-8 dark:border-slate-800/70">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                MAC Address
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {host.mac_address || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Vendor
              </p>
              <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                {host.mac_vendor || 'Unknown'}
              </p>
            </div>
          </div>

          <div className="border-l border-slate-200/70 pl-8 dark:border-slate-800/70">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Comment</p>
              {isAdmin && (
                <button
                  onClick={() => onEditComment(host.id, host.user_comment)}
                  className="text-xs font-semibold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                >
                  Edit
                </button>
              )}
            </div>
            <p className="text-xs italic text-slate-600 dark:text-slate-400">
              {host.user_comment || 'No comment'}
            </p>
          </div>

          <div className="border-l border-slate-200/70 pl-8 dark:border-slate-800/70">
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Open Ports ({portsQuery.data?.ports.length ?? 0})
            </p>
            {portsQuery.isLoading ? (
              <p className="text-xs text-slate-400">Loading...</p>
            ) : portsQuery.data?.ports.length === 0 ? (
              <p className="text-xs italic text-slate-400">No open ports</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {portsQuery.data?.ports.map((port) => (
                  <span
                    key={`${port.port}-${port.protocol}`}
                    className="rounded-full border border-slate-200/70 bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:border-slate-800/70 dark:bg-slate-800"
                  >
                    {port.port}/{port.protocol}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

export default Hosts
