import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import ScanEstimateSummary from '../components/ScanEstimateSummary'
import type {
  AlertListResponse,
  CreateNetworkPayload,
  NetworkListResponse,
  ScanListResponse,
  ScannerType,
  ScanProtocol,
  ScanSummary,
  Scanner,
  ScannerListResponse,
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

const scannerTypeStyles: Record<string, string> = {
  masscan:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  nmap: 'border-violet-300/50 bg-violet-500/15 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-200',
}

const scannerTypeLabels: Record<string, string> = {
  masscan: 'Masscan',
  nmap: 'Nmap',
}

const scanProtocolStyles: Record<string, string> = {
  tcp: 'border-sky-300/50 bg-sky-500/15 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200',
  udp: 'border-purple-300/50 bg-purple-500/15 text-purple-700 dark:border-purple-400/40 dark:bg-purple-500/20 dark:text-purple-200',
  both: 'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200',
}

const scanProtocolLabels: Record<string, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  both: 'Both',
}

const ipVersionStyles: Record<'ipv4' | 'ipv6', string> = {
  ipv4: 'border-teal-300/50 bg-teal-500/15 text-teal-700 dark:border-teal-400/40 dark:bg-teal-500/20 dark:text-teal-200',
  ipv6: 'border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-700 dark:border-fuchsia-400/40 dark:bg-fuchsia-500/20 dark:text-fuchsia-200',
}

const ipVersionLabels: Record<'ipv4' | 'ipv6', string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
}

const DEFAULT_SCAN_TIMEOUT = '3600'
const DEFAULT_PORT_TIMEOUT = '1500'

const Networks = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const now = new Date()

  const [showCreate, setShowCreate] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formValues, setFormValues] = useState({
    name: '',
    cidr: '',
    portSpec: '',
    siteId: '',
    schedule: '',
    scanRate: '',
    scanTimeout: DEFAULT_SCAN_TIMEOUT,
    portTimeout: DEFAULT_PORT_TIMEOUT,
    scannerType: 'masscan' as ScannerType,
    scanProtocol: 'tcp' as ScanProtocol,
  })

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const sitesQuery = useQuery({
    queryKey: ['scanners'],
    queryFn: () => fetchJson<ScannerListResponse>('/api/scanners', token ?? ''),
    enabled: Boolean(token),
  })

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'active-counts'],
    queryFn: () =>
      fetchJson<AlertListResponse>('/api/alerts?acknowledged=false&limit=200', token ?? ''),
    enabled: Boolean(token),
  })

  const networkIds = useMemo(
    () => networksQuery.data?.networks.map((network) => network.id) ?? [],
    [networksQuery.data?.networks],
  )

  const latestScanQueries = useQueries({
    queries: networkIds.map((networkId) => ({
      queryKey: ['networks', networkId, 'scans', 'latest'],
      queryFn: () =>
        fetchJson<ScanListResponse>(`/api/networks/${networkId}/scans?limit=1`, token ?? ''),
      enabled: Boolean(token),
    })),
  })

  const latestScansByNetworkId = useMemo(() => {
    const entries = new Map<number, ScanSummary | null>()
    networkIds.forEach((id, index) => {
      const scan = latestScanQueries[index]?.data?.scans?.[0] ?? null
      entries.set(id, scan)
    })
    return entries
  }, [latestScanQueries, networkIds])

  const scannersById = useMemo(() => {
    const entries = new Map<number, Scanner>()
    sitesQuery.data?.scanners?.forEach((scanner) => {
      entries.set(scanner.id, scanner)
    })
    return entries
  }, [sitesQuery.data?.scanners])

  const alertsByNetworkName = useMemo(() => {
    const counts = new Map<string, number>()
    alertsQuery.data?.alerts?.forEach((alert) => {
      counts.set(alert.network_name, (counts.get(alert.network_name) ?? 0) + 1)
    })
    return counts
  }, [alertsQuery.data?.alerts])

  useEffect(() => {
    if (!showCreate) {
      return
    }
    if (!formValues.siteId && sitesQuery.data?.scanners?.length) {
      setFormValues((prev) => ({
        ...prev,
        siteId: String(sitesQuery.data?.scanners?.[0]?.id ?? ''),
      }))
    }
  }, [formValues.siteId, showCreate, sitesQuery.data?.scanners])

  const createNetworkMutation = useMutation({
    mutationFn: async (payload: CreateNetworkPayload) => {
      const response = await fetch(`${API_BASE_URL}/api/networks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json()
    },
    onSuccess: async () => {
      setShowCreate(false)
      setFormError(null)
      setFormValues({
        name: '',
        cidr: '',
        portSpec: '',
        siteId: '',
        schedule: '',
        scanRate: '',
        scanTimeout: DEFAULT_SCAN_TIMEOUT,
        portTimeout: DEFAULT_PORT_TIMEOUT,
        scannerType: 'masscan',
        scanProtocol: 'tcp',
      })
      await queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to create network')
    },
  })

  const networks = networksQuery.data?.networks ?? []

  const openCreateModal = () => {
    setFormError(null)
    setFormValues({
      name: '',
      cidr: '',
      portSpec: '',
      siteId: sitesQuery.data?.scanners?.[0] ? String(sitesQuery.data.scanners[0].id) : '',
      schedule: '',
      scanRate: '',
      scanTimeout: DEFAULT_SCAN_TIMEOUT,
      portTimeout: DEFAULT_PORT_TIMEOUT,
      scannerType: 'masscan',
      scanProtocol: 'tcp',
    })
    setShowCreate(true)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!token) {
      setFormError('Authentication required to create a network.')
      return
    }

    if (!formValues.siteId) {
      setFormError('Please select a site for this network.')
      return
    }

    const rate = formValues.scanRate ? Number.parseInt(formValues.scanRate, 10) : null
    if (formValues.scanRate && (Number.isNaN(rate) || (rate !== null && rate <= 0))) {
      setFormError('Scan rate must be a positive integer.')
      return
    }

    const scanTimeout = Number.parseInt(formValues.scanTimeout, 10)
    if (Number.isNaN(scanTimeout) || scanTimeout < 60 || scanTimeout > 86400) {
      setFormError('Scan timeout must be between 60 and 86400 seconds.')
      return
    }

    const portTimeout = Number.parseInt(formValues.portTimeout, 10)
    if (Number.isNaN(portTimeout) || portTimeout < 100 || portTimeout > 30000) {
      setFormError('Port timeout must be between 100 and 30000 milliseconds.')
      return
    }

    createNetworkMutation.mutate({
      name: formValues.name.trim(),
      cidr: formValues.cidr.trim(),
      port_spec: formValues.portSpec.trim(),
      scanner_id: Number(formValues.siteId),
      scan_schedule: formValues.schedule.trim() || null,
      scan_rate: rate,
      scan_timeout: scanTimeout,
      port_timeout: portTimeout,
      scanner_type: formValues.scannerType,
      scan_protocol: formValues.scanProtocol,
    })
  }

  const isLoading =
    networksQuery.isLoading ||
    sitesQuery.isLoading ||
    alertsQuery.isLoading ||
    latestScanQueries.some((query) => query.isLoading)

  const hasError = networksQuery.isError || sitesQuery.isError || alertsQuery.isError

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-16 top-8 h-64 w-64 animate-drift rounded-full bg-cyan-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-8 top-36 h-64 w-64 animate-drift rounded-full bg-emerald-500/15 blur-[140px]" />

      <section className="relative z-10 space-y-6">
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Networks</p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                Monitored network inventory
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Track the ranges assigned to each scanner, review last scan status, and keep an eye
                on active alert volumes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
                {isLoading ? 'Refreshing networks...' : `Updated ${formatDateTime(now)}`}
              </div>
              {user?.role === 'admin' ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Create Network
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
            <div className="grid grid-cols-1 gap-4 border-b border-slate-200/70 bg-slate-50/80 px-5 py-4 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[1.6fr_1.2fr_1fr_0.7fr_0.7fr_1.2fr_1fr_0.6fr]">
              <span>Name</span>
              <span>CIDR</span>
              <span>Scanner</span>
              <span>Type</span>
              <span>Protocol</span>
              <span>Last scan</span>
              <span>Status</span>
              <span className="text-right">Alerts</span>
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {hasError ? (
                <div className="px-6 py-6 text-sm text-rose-600 dark:text-rose-200">
                  Unable to load networks right now.
                </div>
              ) : networks.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No networks have been added yet.
                </div>
              ) : (
                networks.map((network) => {
                  const scanner = scannersById.get(network.scanner_id)
                  const scan = latestScansByNetworkId.get(network.id) ?? null
                  const scanDateRaw = scan?.completed_at ?? scan?.cancelled_at ?? scan?.started_at
                  const scanDate = scanDateRaw ? parseUtcDate(scanDateRaw) : null
                  const scanLabel = scanDate ? formatRelativeTime(scanDate, now) : 'No scans'
                  const scanDetail = scanDate ? formatDateTime(scanDate) : 'Awaiting first run'
                  const statusKey = scan?.status ?? 'planned'
                  const statusLabel = scan ? (statusLabels[statusKey] ?? 'Unknown') : 'Not run'
                  const statusStyle = statusStyles[statusKey]
                  const alertCount = alertsByNetworkName.get(network.name) ?? 0
                  const isIpv6 = network.is_ipv6 ?? network.cidr.includes(':')
                  const ipVersionKey = isIpv6 ? 'ipv6' : 'ipv4'

                  const handleRowClick = () => {
                    navigate(`/networks/${network.id}`)
                  }

                  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleRowClick()
                    }
                  }

                  return (
                    <div
                      key={network.id}
                      role="button"
                      tabIndex={0}
                      onClick={handleRowClick}
                      onKeyDown={handleKeyDown}
                      className="grid cursor-pointer grid-cols-1 gap-4 px-5 py-4 text-sm transition hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70 dark:hover:bg-slate-900/60 md:grid-cols-[1.6fr_1.2fr_1fr_0.7fr_0.7fr_1.2fr_1fr_0.6fr]"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {network.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {network.port_spec}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span>{network.cidr}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
                            ipVersionStyles[ipVersionKey]
                          }`}
                        >
                          {ipVersionLabels[ipVersionKey]}
                        </span>
                      </div>
                      <div>
                        <p className="text-slate-700 dark:text-slate-200">
                          {scanner?.name ?? 'Unknown scanner'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {network.scan_schedule || 'Manual only'}
                        </p>
                      </div>
                      <div className="flex items-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${
                            scannerTypeStyles[network.scanner_type] ?? scannerTypeStyles.masscan
                          }`}
                        >
                          {scannerTypeLabels[network.scanner_type] ?? 'Masscan'}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${
                            scanProtocolStyles[network.scan_protocol] ?? scanProtocolStyles.tcp
                          }`}
                        >
                          {scanProtocolLabels[network.scan_protocol] ?? 'TCP'}
                        </span>
                      </div>
                      <div>
                        <p className="text-slate-700 dark:text-slate-200">{scanLabel}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{scanDetail}</p>
                      </div>
                      <div className="flex items-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                            statusStyle ??
                            'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-right text-slate-900 dark:text-white">
                        {alertsQuery.isLoading ? '—' : alertCount}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Create network
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Add a monitored range
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Name
                  <input
                    type="text"
                    required
                    value={formValues.name}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="HQ perimeter"
                  />
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  CIDR range
                  <input
                    type="text"
                    required
                    value={formValues.cidr}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        cidr: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="192.168.10.0/24"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Port specification
                  <input
                    type="text"
                    required
                    value={formValues.portSpec}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        portSpec: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="80-443,8080,!88"
                  />
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Scan rate (pps)
                  <input
                    type="number"
                    min="1"
                    value={formValues.scanRate}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        scanRate: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="100"
                  />
                </label>
              </div>
              <div className="mt-4">
                <ScanEstimateSummary
                  cidr={formValues.cidr}
                  portSpec={formValues.portSpec}
                  scanRate={formValues.scanRate}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-2">
                    Scan timeout (seconds)
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300"
                      title="Maximum time allowed for the entire scan before it is stopped."
                    >
                      ?
                    </span>
                  </span>
                  <input
                    type="number"
                    required
                    min="60"
                    max="86400"
                    value={formValues.scanTimeout}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        scanTimeout: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="3600"
                  />
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    Range 60-86400 seconds
                  </span>
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-2">
                    Port timeout (milliseconds)
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300"
                      title="Maximum time to wait for a port response before moving on."
                    >
                      ?
                    </span>
                  </span>
                  <input
                    type="number"
                    required
                    min="100"
                    max="30000"
                    value={formValues.portTimeout}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        portTimeout: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="1500"
                  />
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    Range 100-30000 milliseconds
                  </span>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Scanner site
                  <select
                    required
                    value={formValues.siteId}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        siteId: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="" disabled>
                      Select a site
                    </option>
                    {sitesQuery.data?.scanners.map((scanner) => (
                      <option key={scanner.id} value={scanner.id}>
                        {scanner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Cron schedule
                  <input
                    type="text"
                    value={formValues.schedule}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        schedule: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="0 * * * *"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Scanner type
                  <select
                    value={formValues.scannerType}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        scannerType: event.target.value as ScannerType,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="masscan">Masscan</option>
                    <option value="nmap">Nmap</option>
                  </select>
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Scan protocol
                  <select
                    value={formValues.scanProtocol}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        scanProtocol: event.target.value as ScanProtocol,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="both">Both</option>
                  </select>
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    UDP scans are slower and may produce less reliable results
                  </span>
                </label>
              </div>

              {formError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createNetworkMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {createNetworkMutation.isPending ? 'Creating...' : 'Create network'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Networks
