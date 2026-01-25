import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ScanLogViewer from '../components/ScanLogViewer'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import { formatRawScanLogs, openScanLogsWindow, parseUtcDate } from '../utils/scanLogs'
import type { NetworkListResponse, ScanLogsResponse, ScansListResponse } from '../types'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

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

const formatDuration = (startedAt: string | null, completedAt: string | null, now: Date) => {
  if (!startedAt) {
    return '—'
  }
  const start = parseUtcDate(startedAt)
  const end = completedAt ? parseUtcDate(completedAt) : now
  const diffMs = end.getTime() - start.getTime()
  if (diffMs < 0) {
    return '—'
  }
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

const statusStyles: Record<string, string> = {
  planned:
    'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300',
  running:
    'border-sky-300/50 bg-sky-500/15 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200',
  completed:
    'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200',
  failed:
    'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
  cancelled:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
}

const statusLabels: Record<string, string> = {
  planned: 'Planned',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const statusFilterOptions = [
  { value: '', label: 'All status' },
  { value: 'planned', label: 'Planned' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const Scans = () => {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [now, setNow] = useState(() => new Date())
  const [logModalScanId, setLogModalScanId] = useState<number | null>(null)
  const [cancelModalScanId, setCancelModalScanId] = useState<number | null>(null)
  const [cancellingScanIds, setCancellingScanIds] = useState<Set<number>>(() => new Set())
  const [activeCancelScanId, setActiveCancelScanId] = useState<number | null>(null)
  const [showHiddenScans, setShowHiddenScans] = useState(false)
  const [manageScanId, setManageScanId] = useState<number | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const networkIdParam = searchParams.get('network_id')
  const networkIdFilter = networkIdParam ? Number(networkIdParam) : null
  const isValidNetworkFilter =
    networkIdFilter !== null && Number.isFinite(networkIdFilter) && networkIdFilter > 0

  const statusParam = searchParams.get('status') ?? ''
  const isValidStatusFilter = Boolean(statusParam && statusLabels[statusParam])
  const statusFilter = isValidStatusFilter ? statusParam : ''

  const scansQuery = useQuery({
    queryKey: ['scans', 'all', networkIdFilter, showHiddenScans],
    queryFn: () => {
      const params = new URLSearchParams()
      if (isValidNetworkFilter) {
        params.set('network_id', String(networkIdFilter))
      }
      if (showHiddenScans) {
        params.set('include_hidden', 'true')
      }
      params.set('limit', '100')
      const queryString = params.toString()
      return fetchJson<ScansListResponse>(
        `/api/scans${queryString ? `?${queryString}` : ''}`,
        token ?? '',
      )
    },
    enabled: Boolean(token),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const logModalScan = useMemo(() => {
    if (!logModalScanId) {
      return null
    }
    const scans = scansQuery.data?.scans ?? []
    return scans.find((scan) => scan.id === logModalScanId) ?? null
  }, [logModalScanId, scansQuery.data?.scans])

  const managingScan = useMemo(() => {
    if (!manageScanId) {
      return null
    }
    const scans = scansQuery.data?.scans ?? []
    return scans.find((scan) => scan.id === manageScanId) ?? null
  }, [manageScanId, scansQuery.data?.scans])

  const logsQuery = useQuery({
    queryKey: ['scan', logModalScanId, 'logs'],
    queryFn: () => fetchJson<ScanLogsResponse>(`/api/scans/${logModalScanId}/logs`, token ?? ''),
    enabled: Boolean(token && logModalScanId),
    refetchInterval: logModalScan?.status === 'running' ? 5000 : false,
    refetchIntervalInBackground: true,
  })

  const networks = networksQuery.data?.networks ?? []
  const isLoading = scansQuery.isLoading || networksQuery.isLoading
  const hasError = scansQuery.isError || networksQuery.isError
  const isAdmin = user?.role === 'admin'

  const selectedNetwork = isValidNetworkFilter
    ? networks.find((n) => n.id === networkIdFilter)
    : null

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key)
      } else {
        nextParams.set(key, value)
      }
    })
    setSearchParams(nextParams)
  }

  const handleNetworkFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    updateSearchParams({ network_id: value || null })
  }

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    updateSearchParams({ status: value || null })
  }

  const handleRowClick = (scanId: number) => {
    navigate(`/scans/${scanId}`)
  }

  const filteredScans = useMemo(() => {
    const scansData = scansQuery.data?.scans ?? []
    const scansToFilter = isValidStatusFilter
      ? scansData.filter((scan) => scan.status === statusFilter)
      : scansData
    return [...scansToFilter].sort((a, b) => {
      const aRunning = a.status === 'running'
      const bRunning = b.status === 'running'
      if (aRunning !== bRunning) {
        return aRunning ? -1 : 1
      }
      const aTime = a.started_at ? parseUtcDate(a.started_at).getTime() : 0
      const bTime = b.started_at ? parseUtcDate(b.started_at).getTime() : 0
      return bTime - aTime
    })
  }, [isValidStatusFilter, scansQuery.data?.scans, statusFilter])

  const logs = logsQuery.data?.logs ?? []
  const handleShowRawLogs = () => {
    if (!logModalScanId || logs.length === 0) {
      return
    }
    const logText = formatRawScanLogs(logs)
    openScanLogsWindow(logText, `Scan ${logModalScanId} Logs`)
  }

  const cancelScanMutation = useMutation({
    mutationFn: async (scanId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}/cancel`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(token ?? ''),
        },
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json()
    },
    onMutate: (scanId) => {
      setActiveCancelScanId(scanId)
    },
    onSuccess: async (_data, scanId) => {
      setCancelModalScanId(null)
      setCancellingScanIds((prev) => {
        const next = new Set(prev)
        next.add(scanId)
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ['scans', 'all'] })
    },
    onError: (error) => {
      setCancelModalScanId(null)
      const message = error instanceof Error ? error.message : 'Failed to cancel scan'
      window.alert(message)
    },
    onSettled: () => {
      setActiveCancelScanId(null)
    },
  })

  const deleteScanMutation = useMutation({
    mutationFn: async (scanId: number) => {
      if (!token) {
        throw new Error('Authentication required to delete scans.')
      }
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(token),
        },
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      setManageScanId(null)
      await queryClient.invalidateQueries({ queryKey: ['scans', 'all'] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to delete scan'
      window.alert(message)
    },
  })

  const toggleHiddenScanMutation = useMutation({
    mutationFn: async ({ scanId, hidden }: { scanId: number; hidden: boolean }) => {
      if (!token) {
        throw new Error('Authentication required to update scan visibility.')
      }
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}/visibility`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hidden }),
      })
      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      setManageScanId(null)
      await queryClient.invalidateQueries({ queryKey: ['scans', 'all'] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to update scan visibility'
      window.alert(message)
    },
  })

  useEffect(() => {
    const scans = scansQuery.data?.scans
    if (!scans) {
      return
    }
    setCancellingScanIds((prev) => {
      if (prev.size === 0) {
        return prev
      }
      const next = new Set<number>()
      for (const scanId of prev) {
        const scan = scans.find((item) => item.id === scanId)
        if (scan?.status === 'running') {
          next.add(scanId)
        }
      }
      if (next.size === prev.size) {
        let isSame = true
        for (const scanId of prev) {
          if (!next.has(scanId)) {
            isSame = false
            break
          }
        }
        if (isSame) {
          return prev
        }
      }
      return next
    })
  }, [scansQuery.data?.scans])

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-sky-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-emerald-500/20 blur-[140px]" />

      <section className="relative z-10 space-y-8">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Scan History
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                {selectedNetwork ? `Scans for ${selectedNetwork.name}` : 'All Scans'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Review scan history, compare runs, and dig into scan outcomes across all monitored
                networks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
              <select
                value={statusFilter}
                onChange={handleStatusFilterChange}
                className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                {statusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowHiddenScans((prev) => !prev)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  showHiddenScans
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-400 dark:text-emerald-200'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900'
                }`}
              >
                {showHiddenScans ? 'Hide hidden scans' : 'Show hidden scans'}
              </button>
              <Link
                to="/"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Back to dashboard
              </Link>
            </div>
          </div>

          {hasError ? (
            <div className="mt-6 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load scans right now.
            </div>
          ) : null}

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <div className="grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/80 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[1.2fr_1fr_0.8fr_1.2fr_0.8fr_0.6fr_0.4fr]">
              <span>Network</span>
              <span>Scanner</span>
              <span>Status</span>
              <span>Started</span>
              <span>Duration</span>
              <span className="text-right">Ports</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {isLoading ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  Loading scans...
                </div>
              ) : filteredScans.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No scans recorded yet.
                </div>
              ) : (
                filteredScans.map((scan) => {
                  const scanDateRaw = scan.started_at
                  const scanDate = scanDateRaw ? parseUtcDate(scanDateRaw) : null
                  const scanLabel = scanDate ? formatRelativeTime(scanDate, now) : 'Not started'
                  const scanDetail = scanDate ? formatDateTime(scanDate) : 'Pending'
                  const duration = formatDuration(
                    scan.started_at,
                    scan.completed_at ?? scan.cancelled_at ?? null,
                    now,
                  )
                  const statusLabel = statusLabels[scan.status] ?? 'Unknown'
                  const statusStyle = statusStyles[scan.status]
                  const isRunning = scan.status === 'running'
                  const progressPercent = scan.progress_percent ?? 0
                  const isCancelling =
                    isRunning && (cancellingScanIds.has(scan.id) || activeCancelScanId === scan.id)
                  const logButtonStyle =
                    scan.status === 'failed'
                      ? 'border-rose-200/70 bg-rose-50/60 text-rose-600 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20'
                      : 'border-slate-200/70 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800'

                  return (
                    <div
                      key={scan.id}
                      onClick={() => handleRowClick(scan.id)}
                      className={`cursor-pointer px-5 py-4 text-sm transition hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${
                        scan.hidden
                          ? 'border-l border-dashed border-slate-300/60 dark:border-slate-600/70 opacity-70 dark:opacity-80'
                          : ''
                      }`}
                    >
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_0.8fr_1.2fr_0.8fr_0.6fr_0.4fr]">
                        <div className="flex items-center">
                          <Link
                            to={`/networks/${scan.network_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-slate-900 hover:text-cyan-600 dark:text-white dark:hover:text-cyan-300"
                          >
                            {scan.network_name}
                          </Link>
                          {scan.hidden && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-300">
                              Hidden
                            </span>
                          )}
                        </div>
                        <div className="flex items-center text-slate-600 dark:text-slate-300">
                          {scan.scanner_name}
                        </div>
                        <div className="flex items-center">
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                              statusStyle ??
                              'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300'
                            }`}
                          >
                            {isRunning ? (
                              <span className="mr-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                            ) : null}
                            {statusLabel}
                          </span>
                        </div>
                        <div>
                          <p className="text-slate-700 dark:text-slate-200">{scanLabel}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{scanDetail}</p>
                        </div>
                        <div className="flex items-center text-slate-600 dark:text-slate-300">
                          {duration}
                        </div>
                        <div className="flex items-center justify-end text-slate-900 dark:text-white">
                          {scan.port_count}
                        </div>
                        <div className="flex items-center justify-end">
                          <div className="flex items-center gap-2">
                            {isRunning && isAdmin ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setCancelModalScanId(scan.id)
                                }}
                                disabled={isCancelling}
                                className="rounded-full border border-rose-200/80 bg-rose-50/80 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                              >
                                {isCancelling ? 'Cancelling...' : 'Cancel'}
                              </button>
                            ) : null}
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setManageScanId(scan.id)
                                }}
                                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                                aria-label={`Manage scan ${scan.id}`}
                              >
                                Manage
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                setLogModalScanId(scan.id)
                              }}
                              aria-label={`View logs for ${scan.network_name ?? 'scan'}`}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm transition ${logButtonStyle}`}
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 6h9M8 12h9M8 18h5M5 6h.01M5 12h.01M5 18h.01"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      {isRunning && (
                        <div className="mt-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-400 transition-all duration-500"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                            </div>
                            <span className="min-w-[3rem] text-right text-xs font-semibold text-sky-600 dark:text-sky-300">
                              {progressPercent}%
                            </span>
                          </div>
                          {scan.progress_message && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {scan.progress_message}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {logModalScanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200/70 bg-white p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Scan Logs
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {logModalScan?.network_name ?? 'Unknown network'}
                  </h3>
                  {logModalScan?.status === 'running' && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500"></span>
                      </span>
                      Live
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {logModalScan?.started_at
                    ? formatDateTime(parseUtcDate(logModalScan.started_at))
                    : 'Pending'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleShowRawLogs}
                  disabled={logs.length === 0}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Show Raw Logs
                </button>
                <button
                  onClick={() => setLogModalScanId(null)}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Close logs"
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
            </div>

            <ScanLogViewer
              logs={logs}
              isRunning={logModalScan?.status === 'running'}
              isLoading={logsQuery.isLoading}
              isError={logsQuery.isError}
              maxHeight="420px"
              showHeader={false}
              onShowRaw={handleShowRawLogs}
            />
          </div>
        </div>
      )}

      {manageScanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Manage scan
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Scan #{manageScanId}
                </h3>
                {managingScan?.network_name ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {managingScan.network_name}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setManageScanId(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Delete will remove the scan record along with its Open Port and Alert data. Hiding
              simply removes it from the primary listing; you can still reveal hidden scans using
              the toggle above.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (manageScanId) {
                    deleteScanMutation.mutate(manageScanId)
                  }
                }}
                disabled={deleteScanMutation.isPending}
                className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteScanMutation.isPending ? 'Deleting...' : 'Delete scan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (manageScanId && managingScan) {
                    toggleHiddenScanMutation.mutate({
                      scanId: manageScanId,
                      hidden: !managingScan.hidden,
                    })
                  }
                }}
                disabled={toggleHiddenScanMutation.isPending}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                {managingScan?.hidden ? 'Unhide scan' : 'Hide from list'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelModalScanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Cancel scan
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Stop this scan?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCancelModalScanId(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Cancelling will stop the active scan. Any ports already discovered will be saved.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelModalScanId(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Keep running
              </button>
              <button
                type="button"
                onClick={() => {
                  void cancelScanMutation.mutate(cancelModalScanId)
                }}
                disabled={cancelScanMutation.isPending && activeCancelScanId === cancelModalScanId}
                className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {cancelScanMutation.isPending && activeCancelScanId === cancelModalScanId
                  ? 'Cancelling...'
                  : 'Cancel scan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Scans
