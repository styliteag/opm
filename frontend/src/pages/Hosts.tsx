import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type {
  BulkDeleteHostsResponse,
  Host,
  HostListResponse,
  HostOpenPortListResponse,
  NetworkListResponse,
  TriggerHostDiscoveryResponse,
} from '../types'

type SortKey = 'ip' | 'hostname' | 'last_seen_at' | 'first_seen_at'
type SortDirection = 'asc' | 'desc'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const parseUtcDate = (dateStr: string) => new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

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
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const isAdmin = user?.role === 'admin'

  // Clear URL param after initial load to avoid keeping it in the URL
  useEffect(() => {
    if (searchParams.has('ip')) {
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setOffset(0)
    setSelectedHosts(new Set())
  }, [searchTerm, networkFilter, pingableFilter, sortKey, sortDirection, limit])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: !!token,
  })

  const hostsQuery = useQuery({
    queryKey: ['hosts', searchTerm, networkFilter, pingableFilter, sortKey, sortDirection, offset, limit],
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
      setToast({ message: 'Comment updated', tone: 'success' })
      setEditingComment(null)
    },
    onError: (e) => setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' }),
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
      setToast({ message: `Deleted ${data.deleted_count} hosts`, tone: 'success' })
    },
    onError: (e) => setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' }),
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
      setToast({ message: 'Host discovery scan started', tone: 'success' })
    },
    onError: (e) => setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' }),
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
      setToast({ message: `Rescan started for ${hostIp}`, tone: 'success' })
    },
    onError: (e) => setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' }),
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

  const handleDeleteSelected = () => {
    if (selectedHosts.size === 0) return
    if (!confirm(`Delete ${selectedHosts.size} selected hosts?`)) return
    bulkDeleteMutation.mutate(Array.from(selectedHosts))
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
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.download = `hosts_${timestamp}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)

      setToast({ message: 'CSV export successful', tone: 'success' })
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
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.download = `hosts_${timestamp}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)

      setToast({ message: 'PDF export successful', tone: 'success' })
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Export failed',
        tone: 'error'
      })
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
      className="flex items-center gap-1 font-black uppercase text-[11px] tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
    >
      {label} {sortKey === key && (sortDirection === 'asc' ? '↑' : '↓')}
    </button>
  )

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
      {toast && (
        <div className="fixed top-8 right-8 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div
            className={`px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] font-black uppercase text-xs tracking-[0.2em] border ${toast.tone === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'}`}
          >
            {toast.message}
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">
            Discovered Hosts
          </h1>
          <p className="text-indigo-500 mt-3 uppercase text-[11px] font-black tracking-[0.3em] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Host Discovery Results
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              disabled={isExporting}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
            {isExportDropdownOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-48 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                <button
                  onClick={handleExportCsv}
                  className="w-full px-4 py-3 text-left text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export as CSV
                </button>
                <button
                  onClick={handleExportPdf}
                  className="w-full px-4 py-3 text-left text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center gap-2 border-t border-slate-100 dark:border-slate-800"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export as PDF
                </button>
              </div>
            )}
          </div>
          {isAdmin && (
            <>
              <select
                value={discoveryNetworkId ?? ''}
                onChange={(e) => setDiscoveryNetworkId(e.target.value ? Number(e.target.value) : null)}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-4 ring-violet-500/10 focus:border-violet-500 outline-none transition-all min-w-[200px]"
              >
                <option value="">Select Network...</option>
                {(networksQuery.data?.networks ?? []).map((n) => (
                  <option key={n.id} value={n.id} disabled={!n.host_discovery_enabled}>
                    {n.name} ({n.cidr}){!n.host_discovery_enabled ? ' - disabled' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => discoveryNetworkId && triggerDiscoveryMutation.mutate(discoveryNetworkId)}
                disabled={!discoveryNetworkId || triggerDiscoveryMutation.isPending}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {triggerDiscoveryMutation.isPending ? 'Starting...' : 'Discover Hosts'}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Total Hosts
          </p>
          <p className="text-5xl font-black mt-2 text-indigo-600 tracking-tighter">{totalCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Pingable
          </p>
          <p className="text-5xl font-black mt-2 text-emerald-600 tracking-tighter">
            {pingableCount}
          </p>
        </div>
        <div className="md:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-[60px] -mr-24 -mt-24 transition-colors group-focus-within:bg-indigo-500/10" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-1">
            Search
          </p>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search IP, hostname, MAC..."
            className="w-full mt-2 bg-transparent border-none focus:ring-0 text-2xl font-black tracking-tight placeholder:text-slate-200 dark:placeholder:text-slate-800"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="px-10 py-4 bg-slate-50/30 dark:bg-slate-800/20 flex flex-wrap justify-between items-center gap-6 border-b border-slate-50 dark:border-slate-800/50">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Network
              </span>
              <select
                value={networkFilter ?? ''}
                onChange={(e) => setNetworkFilter(e.target.value ? Number(e.target.value) : null)}
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none w-48 transition-all"
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
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Pingable
              </span>
              <select
                value={pingableFilter}
                onChange={(e) => setPingableFilter(e.target.value)}
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none w-32 transition-all"
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            {isAdmin && selectedHosts.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={bulkDeleteMutation.isPending}
                className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2 self-end"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {bulkDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedHosts.size}`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-bold text-slate-500">
              {totalCount} Hosts (showing {hosts.length})
            </span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
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
                className="px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 disabled:opacity-30 hover:border-indigo-200 transition-all active:scale-95"
              >
                Prev
              </button>
              <button
                disabled={hosts.length < limit}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest bg-slate-900 text-white dark:bg-white dark:text-slate-900 disabled:opacity-30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-50 dark:border-slate-800/50 bg-white dark:bg-slate-900">
                {isAdmin && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={hosts.length > 0 && selectedHosts.size === hosts.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-2 border-slate-200 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-6 py-3">{renderSort('IP Address', 'ip')}</th>
                <th className="px-6 py-3">{renderSort('Hostname', 'hostname')}</th>
                <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Pingable
                </th>
                <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  MAC
                </th>
                <th className="px-6 py-3">{renderSort('Last Seen', 'last_seen_at')}</th>
                {isAdmin && (
                  <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Actions
                  </th>
                )}
                <th className="px-6 py-3 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30">
              {hosts.map((host: Host) => {
                const isOpen = expandedRows.has(host.id)
                const isSelected = selectedHosts.has(host.id)
                return (
                  <React.Fragment key={host.id}>
                    <tr className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                      {isAdmin && (
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(host.id)}
                            className="w-4 h-4 rounded border-2 border-slate-200 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-2 font-mono text-sm">
                        <span className="text-slate-900 dark:text-slate-100 font-bold tracking-tight">
                          {formatIpAddress(host.ip)}
                        </span>
                      </td>
                      <td className="px-6 py-2 text-slate-600 dark:text-slate-400 text-sm">
                        {host.hostname || '-'}
                      </td>
                      <td className="px-6 py-2">
                        {host.is_pingable === null ? (
                          <span className="text-slate-400">-</span>
                        ) : host.is_pingable ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full text-[10px] font-bold uppercase">
                            Yes
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded-full text-[10px] font-bold uppercase">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-2 font-mono text-xs text-slate-500">
                        {host.mac_address || '-'}
                      </td>
                      <td className="px-6 py-2 text-slate-500 text-xs">
                        {formatDateTime(parseUtcDate(host.last_seen_at))}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              rescanHostMutation.mutate(host.ip)
                            }}
                            disabled={rescanHostMutation.isPending}
                            className="rounded-lg border border-cyan-200 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-500/20 dark:border-cyan-500/40 dark:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Rescan this host with nmap"
                          >
                            {rescanHostMutation.isPending ? 'Scanning...' : 'Rescan'}
                          </button>
                        </td>
                      )}
                      <td className="px-6 py-2 text-right">
                        <button
                          onClick={() => toggleExpanded(host.id)}
                          className={`p-1.5 rounded-lg transition-all ${isOpen ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                        >
                          <svg
                            className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
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
                    {isOpen && <HostDetailRow host={host} networkMap={networkMap} isAdmin={isAdmin} token={token} onEditComment={(hostId, comment) => setEditingComment({ hostId, comment: comment || '' })} extraColSpan={isAdmin ? 2 : 0} />}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>

      {editingComment && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-slate-900 p-16 rounded-[4rem] w-full max-w-2xl border border-slate-100 dark:border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-500">
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
              Edit Comment
            </h3>
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
    <tr className="bg-slate-50/20 dark:bg-slate-800/10">
      <td colSpan={6 + extraColSpan} className="px-8 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div>
              <h4 className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-2">
                Networks ({host.seen_by_networks.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {host.seen_by_networks.map((id: number) => (
                  <span
                    key={id}
                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300"
                  >
                    {networkMap.get(id) || `Network ${id}`}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/50">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  First Seen
                </p>
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(host.first_seen_at.endsWith('Z') ? host.first_seen_at : host.first_seen_at + 'Z'))}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Last Seen
                </p>
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(host.last_seen_at.endsWith('Z') ? host.last_seen_at : host.last_seen_at + 'Z'))}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-l border-slate-100 dark:border-slate-800/50 pl-8">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                MAC Address
              </p>
              <p className="text-sm font-bold tracking-wide text-slate-900 dark:text-white uppercase">
                {host.mac_address || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                Vendor
              </p>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                {host.mac_vendor || 'Unknown'}
              </p>
            </div>
          </div>

          <div className="border-l border-slate-100 dark:border-slate-800/50 pl-8">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                Comment
              </p>
              {isAdmin && (
                <button
                  onClick={() => onEditComment(host.id, host.user_comment)}
                  className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 italic">
              {host.user_comment || 'No comment'}
            </p>
          </div>

          <div className="border-l border-slate-100 dark:border-slate-800/50 pl-8">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Open Ports ({portsQuery.data?.ports.length ?? 0})
            </p>
            {portsQuery.isLoading ? (
              <p className="text-xs text-slate-400">Loading...</p>
            ) : portsQuery.data?.ports.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No open ports</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {portsQuery.data?.ports.map((port) => (
                  <span
                    key={`${port.port}-${port.protocol}`}
                    className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold"
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
