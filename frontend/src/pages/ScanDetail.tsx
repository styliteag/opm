import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, getAuthHeaders, fetchJson } from '../lib/api'
import { ScanLogViewer } from '../components/ScanLogViewer'
import { formatRawScanLogs, openScanLogsWindow, parseUtcDate } from '../utils/scanLogs'
import type { OpenPort, ScanDetail, ScanDiff, ScanLogsResponse, ScansListResponse } from '../types'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const formatDuration = (startedAt: string | null, completedAt: string | null) => {
  if (!startedAt) {
    return '—'
  }
  const start = parseUtcDate(startedAt)
  const end = completedAt ? parseUtcDate(completedAt) : new Date()
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

type ToastMessage = {
  message: string
  tone: 'success' | 'error'
}

const ScanDetailPage = () => {
  const { token } = useAuth()
  const { scanId } = useParams<{ scanId: string }>()
  const [compareToId, setCompareToId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'ports' | 'logs'>('ports')
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const scanQuery = useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => fetchJson<ScanDetail>(`/api/scans/${scanId}`, token ?? ''),
    enabled: Boolean(token && scanId),
  })

  const scan = scanQuery.data
  const networkId = scan?.network_id

  // Fetch list of scans for the same network (for comparison dropdown)
  const networkScansQuery = useQuery({
    queryKey: ['scans', 'network', networkId],
    queryFn: () =>
      fetchJson<ScansListResponse>(`/api/scans?network_id=${networkId}&limit=50`, token ?? ''),
    enabled: Boolean(token && networkId),
  })

  // Fetch diff when compareToId is selected
  const diffQuery = useQuery({
    queryKey: ['scan', scanId, 'diff', compareToId],
    queryFn: () =>
      fetchJson<ScanDiff>(`/api/scans/${scanId}/diff?compare_to=${compareToId}`, token ?? ''),
    enabled: Boolean(token && scanId && compareToId),
  })

  // Fetch logs for the scan (refetch every 5 seconds when running)
  const logsQuery = useQuery({
    queryKey: ['scan', scanId, 'logs'],
    queryFn: () => fetchJson<ScanLogsResponse>(`/api/scans/${scanId}/logs`, token ?? ''),
    enabled: Boolean(token && scanId),
    refetchInterval: scan?.status === 'running' ? 5000 : false,
  })

  const logs = logsQuery.data?.logs ?? []
  const handleShowRawLogs = () => {
    if (logs.length === 0) {
      return
    }
    setActiveTab('logs')
    const logText = formatRawScanLogs(logs)
    const title = scanId ? `Scan ${scanId} Logs` : 'Scan Logs'
    openScanLogsWindow(logText, title)
  }

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const handleExportCsv = async () => {
    if (!scanId || !token) return
    setIsExporting(true)
    setShowExportDropdown(false)
    try {
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}/export/csv`, {
        headers: getAuthHeaders(token),
      })
      if (!response.ok) {
        throw new Error('Failed to export CSV')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      link.download = `scan_${scanId}_${timestamp}.csv`
      link.click()
      URL.revokeObjectURL(url)
      setToast({ message: 'CSV export complete', tone: 'success' })
    } catch {
      setToast({ message: 'CSV export failed', tone: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPdf = async () => {
    if (!scanId || !token) return
    setIsExporting(true)
    setShowExportDropdown(false)
    try {
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}/export/pdf`, {
        headers: getAuthHeaders(token),
      })
      if (!response.ok) {
        throw new Error('Failed to export PDF')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      link.download = `scan_${scanId}_${timestamp}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      setToast({ message: 'PDF export complete', tone: 'success' })
    } catch {
      setToast({ message: 'PDF export failed', tone: 'error' })
    } finally {
      setIsExporting(false)
    }
  }
  const errorLogs = [...logs]
    .filter((log) => log.level.toLowerCase() === 'error')
    .sort((a, b) => parseUtcDate(a.timestamp).getTime() - parseUtcDate(b.timestamp).getTime())
  const commandMessage = (() => {
    for (const log of logs) {
      const message = log.message
      if (/command/i.test(message)) return message
      if (/running (masscan|nmap)/i.test(message)) return message
      if (/executing/i.test(message)) return message
    }
    return null
  })()
  const cancelledByLabel =
    scan?.cancelled_by_email ?? (scan?.cancelled_by ? `User #${scan.cancelled_by}` : 'Unknown user')
  const cancelledAtLabel = scan?.cancelled_at
    ? formatDateTime(parseUtcDate(scan.cancelled_at))
    : 'Unknown time'

  const networkScans = networkScansQuery.data?.scans ?? []
  const otherScans = networkScans.filter((s) => s.id !== Number(scanId))

  const isLoading = scanQuery.isLoading
  const hasError = scanQuery.isError

  const handleCompareChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value) {
      setCompareToId(Number(value))
    } else {
      setCompareToId(null)
    }
  }

  const diff = diffQuery.data
  const isDiffMode = compareToId !== null && diff !== undefined

  // Determine which ports to display
  const portsToDisplay: Array<{ port: OpenPort; changeType: 'added' | 'removed' | 'unchanged' }> =
    []
  if (isDiffMode) {
    for (const port of diff.added_ports) {
      portsToDisplay.push({ port, changeType: 'added' })
    }
    for (const port of diff.removed_ports) {
      portsToDisplay.push({ port, changeType: 'removed' })
    }
    for (const port of diff.unchanged_ports) {
      portsToDisplay.push({ port, changeType: 'unchanged' })
    }
  } else if (scan) {
    for (const port of scan.open_ports) {
      portsToDisplay.push({ port, changeType: 'unchanged' })
    }
  }

  // Sort ports by IP and port number
  portsToDisplay.sort((a, b) => {
    const ipCompare = a.port.ip.localeCompare(b.port.ip)
    if (ipCompare !== 0) return ipCompare
    return a.port.port - b.port.port
  })

  const changeTypeStyles: Record<string, string> = {
    added: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    removed: 'bg-rose-500/10 dark:bg-rose-500/15',
    unchanged: '',
  }

  const changeTypeBadgeStyles: Record<string, string> = {
    added:
      'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200',
    removed:
      'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
    unchanged:
      'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300',
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-sky-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-emerald-500/20 blur-[140px]" />

      <section className="relative z-10 space-y-8">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          {isLoading ? (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400">
              Loading scan details...
            </div>
          ) : hasError ? (
            <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load scan details.
            </div>
          ) : scan ? (
            <>
              {/* Header */}
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Scan #{scan.id}
                  </p>
                  <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                    Scan Details
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowExportDropdown(!showExportDropdown)}
                      disabled={isExporting}
                      className="rounded-full border border-cyan-200 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-600 transition hover:border-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-400/40 dark:bg-cyan-500/20 dark:text-cyan-300 dark:hover:border-cyan-400/60 dark:hover:bg-cyan-500/30"
                    >
                      {isExporting ? 'Exporting...' : 'Export ▾'}
                    </button>
                    {showExportDropdown && (
                      <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:border-slate-800/70 dark:bg-slate-950">
                        <button
                          type="button"
                          onClick={handleExportCsv}
                          className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          Export as CSV
                        </button>
                        <button
                          type="button"
                          onClick={handleExportPdf}
                          className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          Export as PDF
                        </button>
                      </div>
                    )}
                  </div>
                  <Link
                    to={`/scans?network_id=${scan.network_id}`}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                  >
                    Back to scans
                  </Link>
                </div>
              </div>

              {scan.status === 'failed' ? (
                <div className="mt-8 rounded-3xl border border-rose-200/80 bg-rose-50/70 p-6 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                        Scan Failed
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-rose-900 dark:text-rose-100">
                        {scan.error_message ?? 'Scan failed.'}
                      </h3>
                    </div>
                    {commandMessage ? (
                      <div className="rounded-2xl border border-rose-200/60 bg-white/80 px-4 py-3 text-xs text-rose-700 shadow-sm dark:border-rose-500/30 dark:bg-slate-950/60 dark:text-rose-200">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-300">
                          Scanner Command
                        </p>
                        <p className="mt-1 break-all font-mono text-[12px] text-rose-800 dark:text-rose-100">
                          {commandMessage}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <details className="group mt-4 rounded-2xl border border-rose-200/60 bg-white/70 p-4 dark:border-rose-500/30 dark:bg-slate-950/60">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-rose-700 dark:text-rose-200">
                      Error logs ({errorLogs.length})
                    </summary>
                    <div className="mt-4 space-y-3">
                      {logsQuery.isLoading ? (
                        <div className="text-sm text-rose-600/80 dark:text-rose-200/80">
                          Loading error logs...
                        </div>
                      ) : logsQuery.isError ? (
                        <div className="text-sm text-rose-600/80 dark:text-rose-200/80">
                          Unable to load error logs.
                        </div>
                      ) : errorLogs.length === 0 ? (
                        <div className="text-sm text-rose-600/70 dark:text-rose-200/70">
                          No error logs were captured for this scan.
                        </div>
                      ) : (
                        <div className="divide-y divide-rose-200/60 rounded-2xl border border-rose-200/60 bg-rose-50/60 text-sm dark:divide-rose-500/20 dark:border-rose-500/30 dark:bg-rose-500/10">
                          {errorLogs.map((log, index) => (
                            <div
                              key={`${log.timestamp}-${index}`}
                              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
                            >
                              <span className="whitespace-nowrap text-xs text-rose-500 dark:text-rose-300">
                                {formatDateTime(parseUtcDate(log.timestamp))}
                              </span>
                              <span className="flex-1 break-all text-rose-700 dark:text-rose-100">
                                {log.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              ) : null}

              {scan.status === 'cancelled' ? (
                <div className="mt-8 rounded-3xl border border-amber-200/80 bg-amber-50/70 p-6 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                        Scan Cancelled
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-amber-900 dark:text-amber-100">
                        {scan.error_message ?? 'Scan was cancelled by user request.'}
                      </h3>
                      <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
                        Cancelled by {cancelledByLabel} at {cancelledAtLabel}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Scan Info Cards */}
              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status</p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${statusStyles[scan.status] ?? statusStyles.planned
                        }`}
                    >
                      {scan.status === 'running' ? (
                        <span className="mr-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                      ) : null}
                      {statusLabels[scan.status] ?? 'Unknown'}
                    </span>
                  </div>
                  {scan.status === 'running' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-400 transition-all duration-500"
                              style={{ width: `${scan.progress_percent ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <span className="min-w-[2.5rem] text-right text-xs font-bold text-sky-600 dark:text-sky-300">
                          {(scan.progress_percent ?? 0).toFixed(1)}%
                        </span>
                      </div>
                      {scan.progress_message && (
                        <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {scan.progress_message}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Network
                  </p>
                  <p className="mt-2">
                    <Link
                      to={`/networks/${scan.network_id}`}
                      className="text-sm font-medium text-slate-900 hover:text-cyan-600 dark:text-white dark:hover:text-cyan-300"
                    >
                      View Network
                    </Link>
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Started
                  </p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    {scan.started_at
                      ? formatDateTime(parseUtcDate(scan.started_at))
                      : 'Not started'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Duration
                  </p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    {formatDuration(
                      scan.started_at,
                      scan.completed_at ?? scan.cancelled_at ?? null,
                    )}
                  </p>
                </div>
              </div>

              {/* Additional info row */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Trigger Type
                  </p>
                  <p className="mt-2 text-sm capitalize text-slate-700 dark:text-slate-200">
                    {scan.trigger_type}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Open Ports
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {scan.open_ports.length}
                  </p>
                </div>

                {scan.completed_at ? (
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Completed
                    </p>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                      {formatDateTime(parseUtcDate(scan.completed_at))}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Tab Navigation */}
              <div className="mt-8 flex flex-col gap-3 border-b border-slate-200/70 dark:border-slate-800/70 md:flex-row md:flex-wrap md:items-center md:justify-between">
                <div className="flex overflow-hidden rounded-full bg-slate-50/60 dark:bg-slate-900/40">
                  <button
                    onClick={() => setActiveTab('ports')}
                    className={`px-6 py-3 text-sm font-semibold transition ${activeTab === 'ports'
                      ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                  >
                    Ports ({scan.open_ports.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-6 py-3 text-sm font-semibold transition ${activeTab === 'logs'
                      ? 'border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                  >
                    Logs ({logs.length})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleShowRawLogs}
                  disabled={logs.length === 0}
                  className="ml-auto rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Show Raw Logs
                </button>
              </div>

              {/* Ports Tab Content */}
              {activeTab === 'ports' ? (
                <>
                  {/* Compare Section */}
                  <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {isDiffMode ? 'Port Comparison' : 'Open Ports'}
                    </h3>
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor="compare-select"
                        className="text-sm font-medium text-slate-600 dark:text-slate-300"
                      >
                        Compare with:
                      </label>
                      <select
                        id="compare-select"
                        value={compareToId ?? ''}
                        onChange={handleCompareChange}
                        className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">No comparison</option>
                        {otherScans.map((otherScan) => (
                          <option key={otherScan.id} value={otherScan.id}>
                            Scan #{otherScan.id} -{' '}
                            {otherScan.started_at
                              ? formatDateTime(parseUtcDate(otherScan.started_at))
                              : 'Not started'}{' '}
                            ({otherScan.port_count} ports)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Diff Summary */}
                  {isDiffMode ? (
                    <div className="mt-4 flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${changeTypeBadgeStyles.added}`}
                        >
                          +{diff.added_ports.length} Added
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${changeTypeBadgeStyles.removed}`}
                        >
                          -{diff.removed_ports.length} Removed
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${changeTypeBadgeStyles.unchanged}`}
                        >
                          {diff.unchanged_ports.length} Unchanged
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {scan.status === 'cancelled' ? (
                    <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                      This scan was cancelled. Results shown here may be partial.
                    </div>
                  ) : null}

                  {/* Loading diff state */}
                  {compareToId && diffQuery.isLoading ? (
                    <div className="mt-4 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                      Loading comparison...
                    </div>
                  ) : null}

                  {compareToId && diffQuery.isError ? (
                    <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                      Unable to load scan comparison.
                    </div>
                  ) : null}

                  {/* Ports Table */}
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
                    <div className="grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/80 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[0.8fr_0.6fr_0.5fr_1fr_1.2fr]">
                      <span>IP Address</span>
                      <span>Port</span>
                      <span>Protocol</span>
                      <span>Service</span>
                      <span>First Seen</span>
                    </div>
                    <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                      {portsToDisplay.length === 0 ? (
                        <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                          No open ports found.
                        </div>
                      ) : (
                        portsToDisplay.map(({ port, changeType }, index) => (
                          <div
                            key={`${port.ip}-${port.port}-${port.protocol}-${index}`}
                            className={`grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-[0.8fr_0.6fr_0.5fr_1fr_1.2fr] ${changeTypeStyles[changeType]}`}
                          >
                            <div className="flex items-center gap-2">
                              {isDiffMode ? (
                                <span
                                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${changeType === 'added'
                                    ? 'bg-emerald-500 text-white'
                                    : changeType === 'removed'
                                      ? 'bg-rose-500 text-white'
                                      : 'bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-200'
                                    }`}
                                >
                                  {changeType === 'added'
                                    ? '+'
                                    : changeType === 'removed'
                                      ? '−'
                                      : '='}
                                </span>
                              ) : null}
                              <span className="font-mono text-slate-900 dark:text-white">
                                {port.ip}
                              </span>
                            </div>
                            <div className="flex items-center font-mono text-slate-700 dark:text-slate-200">
                              {port.port}
                            </div>
                            <div className="flex items-center text-slate-600 dark:text-slate-300">
                              {port.protocol}
                            </div>
                            <div className="flex items-center text-slate-600 dark:text-slate-300">
                              {port.service_guess || '—'}
                            </div>
                            <div className="flex items-center text-slate-500 dark:text-slate-400">
                              {formatDateTime(parseUtcDate(port.first_seen_at))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              {/* Logs Tab Content */}
              {activeTab === 'logs' ? (
                <div className="mt-6">
                  <ScanLogViewer
                    logs={logs}
                    isRunning={scan.status === 'running'}
                    isLoading={logsQuery.isLoading}
                    isError={logsQuery.isError}
                    onShowRaw={handleShowRawLogs}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-8 right-8 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div
            className={`px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] font-black uppercase text-xs tracking-[0.2em] border ${toast.tone === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'}`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

export default ScanDetailPage
