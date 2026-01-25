import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import ScanEstimateSummary from '../components/ScanEstimateSummary'
import type {
  ExcludedPort,
  ExcludedPortListResponse,
  PortRule,
  PortRuleCreatePayload,
  PortRuleListResponse,
  ScanListResponse,
  ScannerType,
  ScanProtocol,
  ScannerListResponse,
  UpdateNetworkPayload,
} from '../types'

type NetworkResponse = {
  id: number
  name: string
  cidr: string
  port_spec: string
  scanner_id: number
  scan_schedule: string | null
  scan_rate: number | null
  scan_timeout: number | null
  port_timeout: number | null
  scanner_type: ScannerType
  scan_protocol: ScanProtocol
  is_ipv6: boolean
  alert_config: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

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

const NetworkDetail = () => {
  const { networkId } = useParams()
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const now = new Date()

  const parsedNetworkId = Number(networkId)
  const isValidNetworkId = Number.isFinite(parsedNetworkId) && parsedNetworkId > 0

  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancellingScan, setIsCancellingScan] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [formValues, setFormValues] = useState({
    name: '',
    cidr: '',
    portSpec: '',
    scannerId: '',
    schedule: '',
    scanRate: '',
    scanTimeout: DEFAULT_SCAN_TIMEOUT,
    portTimeout: DEFAULT_PORT_TIMEOUT,
    scannerType: 'masscan' as ScannerType,
    scanProtocol: 'tcp' as ScanProtocol,
  })

  // Port rules state
  const [showAddRule, setShowAddRule] = useState(false)
  const [ruleFormError, setRuleFormError] = useState<string | null>(null)
  const [ruleToDelete, setRuleToDelete] = useState<PortRule | null>(null)
  const [ruleFormValues, setRuleFormValues] = useState({
    port: '',
    ruleType: 'allow' as 'allow' | 'block',
    description: '',
  })

  // Excluded ports state
  const [exclusionToDelete, setExclusionToDelete] = useState<ExcludedPort | null>(null)
  const [exclusionError, setExclusionError] = useState<string | null>(null)

  const networkQuery = useQuery({
    queryKey: ['networks', parsedNetworkId],
    queryFn: () => fetchJson<NetworkResponse>(`/api/networks/${parsedNetworkId}`, token ?? ''),
    enabled: Boolean(token && isValidNetworkId),
  })

  const scannersQuery = useQuery({
    queryKey: ['scanners'],
    queryFn: () => fetchJson<ScannerListResponse>('/api/scanners', token ?? ''),
    enabled: Boolean(token),
  })

  const scansQuery = useQuery({
    queryKey: ['networks', parsedNetworkId, 'scans', 'recent'],
    queryFn: () =>
      fetchJson<ScanListResponse>(`/api/networks/${parsedNetworkId}/scans?limit=10`, token ?? ''),
    enabled: Boolean(token && isValidNetworkId),
    // Auto-refresh every 5 seconds when there's a running scan
    refetchInterval: (query) => {
      const data = query.state.data as ScanListResponse | undefined
      const hasRunning = data?.scans?.some((s) => s.status === 'running')
      return hasRunning ? 5000 : false
    },
  })

  const rulesQuery = useQuery({
    queryKey: ['networks', parsedNetworkId, 'rules'],
    queryFn: () =>
      fetchJson<PortRuleListResponse>(`/api/networks/${parsedNetworkId}/rules`, token ?? ''),
    enabled: Boolean(token && isValidNetworkId),
  })

  const exclusionsQuery = useQuery({
    queryKey: ['networks', parsedNetworkId, 'excluded'],
    queryFn: () =>
      fetchJson<ExcludedPortListResponse>(`/api/networks/${parsedNetworkId}/excluded`, token ?? ''),
    enabled: Boolean(token && isValidNetworkId),
  })

  const network = networkQuery.data ?? null
  const rules = rulesQuery.data?.rules ?? []
  const scans = useMemo(() => scansQuery.data?.scans ?? [], [scansQuery.data?.scans])
  const exclusions = exclusionsQuery.data?.excluded_ports ?? []
  const ipVersionKey = network && (network.is_ipv6 ?? network.cidr.includes(':')) ? 'ipv6' : 'ipv4'

  // Find any running scan for this network
  const runningScan = useMemo(() => {
    return scans.find((scan) => scan.status === 'running') ?? null
  }, [scans])

  useEffect(() => {
    if (!runningScan && isCancellingScan) {
      setIsCancellingScan(false)
    }
    if (!runningScan && showCancelConfirm) {
      setShowCancelConfirm(false)
    }
  }, [isCancellingScan, runningScan, showCancelConfirm])

  const scanner = useMemo(() => {
    if (!network || !scannersQuery.data?.scanners) {
      return null
    }
    return scannersQuery.data.scanners.find((item) => item.id === network.scanner_id) ?? null
  }, [network, scannersQuery.data?.scanners])

  const isAdmin = user?.role === 'admin'

  const updateNetworkMutation = useMutation({
    mutationFn: async (payload: UpdateNetworkPayload) => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${parsedNetworkId}`, {
        method: 'PUT',
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
      setShowEdit(false)
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['networks', parsedNetworkId] })
      await queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to update network')
    },
  })

  const triggerScanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${parsedNetworkId}/scan`, {
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
    onSuccess: async () => {
      setActionMessage('Manual scan queued. The scanner will claim it shortly.')
      await queryClient.invalidateQueries({
        queryKey: ['networks', parsedNetworkId, 'scans', 'recent'],
      })
    },
    onError: (error) => {
      setActionMessage(error instanceof Error ? error.message : 'Failed to trigger scan')
    },
  })

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
    onMutate: () => {
      setIsCancellingScan(true)
    },
    onSuccess: async () => {
      setShowCancelConfirm(false)
      setActionMessage('Cancellation requested. The scanner will stop shortly.')
      await queryClient.invalidateQueries({
        queryKey: ['networks', parsedNetworkId, 'scans', 'recent'],
      })
    },
    onError: (error) => {
      setIsCancellingScan(false)
      setActionMessage(error instanceof Error ? error.message : 'Failed to cancel scan')
    },
  })

  const deleteNetworkMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${parsedNetworkId}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(token ?? ''),
        },
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['networks'] })
      navigate('/networks')
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to delete network')
    },
  })

  const createRuleMutation = useMutation({
    mutationFn: async (payload: PortRuleCreatePayload) => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${parsedNetworkId}/rules`, {
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
      setShowAddRule(false)
      setRuleFormError(null)
      setRuleFormValues({ port: '', ruleType: 'allow', description: '' })
      await queryClient.invalidateQueries({
        queryKey: ['networks', parsedNetworkId, 'rules'],
      })
    },
    onError: (error) => {
      setRuleFormError(error instanceof Error ? error.message : 'Failed to create rule')
    },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      const response = await fetch(
        `${API_BASE_URL}/api/networks/${parsedNetworkId}/rules/${ruleId}`,
        {
          method: 'DELETE',
          headers: {
            ...getAuthHeaders(token ?? ''),
          },
        },
      )

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      setRuleToDelete(null)
      await queryClient.invalidateQueries({
        queryKey: ['networks', parsedNetworkId, 'rules'],
      })
    },
    onError: (error) => {
      setRuleFormError(error instanceof Error ? error.message : 'Failed to delete rule')
    },
  })

  const deleteExclusionMutation = useMutation({
    mutationFn: async (exclusionId: number) => {
      const response = await fetch(
        `${API_BASE_URL}/api/networks/${parsedNetworkId}/excluded/${exclusionId}`,
        {
          method: 'DELETE',
          headers: {
            ...getAuthHeaders(token ?? ''),
          },
        },
      )

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      setExclusionToDelete(null)
      setExclusionError(null)
      await queryClient.invalidateQueries({
        queryKey: ['networks', parsedNetworkId, 'excluded'],
      })
    },
    onError: (error) => {
      setExclusionError(error instanceof Error ? error.message : 'Failed to delete exclusion')
    },
  })

  const openEditModal = () => {
    if (!network) {
      return
    }
    setFormError(null)
    setFormValues({
      name: network.name,
      cidr: network.cidr,
      portSpec: network.port_spec,
      scannerId: String(network.scanner_id),
      schedule: network.scan_schedule ?? '',
      scanRate: network.scan_rate ? String(network.scan_rate) : '',
      scanTimeout:
        network.scan_timeout !== null ? String(network.scan_timeout) : DEFAULT_SCAN_TIMEOUT,
      portTimeout:
        network.port_timeout !== null ? String(network.port_timeout) : DEFAULT_PORT_TIMEOUT,
      scannerType: network.scanner_type,
      scanProtocol: network.scan_protocol ?? 'tcp',
    })
    setShowEdit(true)
  }

  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!token) {
      setFormError('Authentication required to update this network.')
      return
    }

    if (!formValues.scannerId) {
      setFormError('Please select a scanner for this network.')
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

    updateNetworkMutation.mutate({
      name: formValues.name.trim(),
      cidr: formValues.cidr.trim(),
      port_spec: formValues.portSpec.trim(),
      scanner_id: Number(formValues.scannerId),
      scan_schedule: formValues.schedule.trim() || null,
      scan_rate: rate,
      scan_timeout: scanTimeout,
      port_timeout: portTimeout,
      scanner_type: formValues.scannerType,
      scan_protocol: formValues.scanProtocol,
    })
  }

  const handleAddRuleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRuleFormError(null)

    if (!token) {
      setRuleFormError('Authentication required to add a rule.')
      return
    }

    if (!ruleFormValues.port.trim()) {
      setRuleFormError('Port is required.')
      return
    }

    createRuleMutation.mutate({
      port: ruleFormValues.port.trim(),
      rule_type: ruleFormValues.ruleType,
      description: ruleFormValues.description.trim() || null,
    })
  }

  if (!isValidNetworkId) {
    return (
      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
        <p className="text-sm text-rose-600 dark:text-rose-200">
          This network identifier is invalid.
        </p>
        <Link
          to="/networks"
          className="mt-4 inline-flex items-center text-xs font-semibold text-cyan-600 dark:text-cyan-300"
        >
          Back to networks
        </Link>
      </section>
    )
  }

  const isLoading = networkQuery.isLoading || scannersQuery.isLoading || scansQuery.isLoading

  const hasError = networkQuery.isError || scannersQuery.isError || scansQuery.isError

  const lastScan = scans[0]
  const lastScanDateRaw = lastScan?.completed_at ?? lastScan?.cancelled_at ?? lastScan?.started_at
  const lastScanDate = lastScanDateRaw ? parseUtcDate(lastScanDateRaw) : null
  const lastScanLabel = lastScanDate ? formatRelativeTime(lastScanDate, now) : 'No scans yet'
  const lastScanDetail = lastScanDate ? formatDateTime(lastScanDate) : 'Awaiting the first scan'

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-sky-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-emerald-500/20 blur-[140px]" />

      <section className="relative z-10 space-y-8">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Network details
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                {network?.name ?? 'Loading network...'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Review configuration, trigger scans, and keep tabs on the most recent results for
                this monitored range.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
                {isLoading ? 'Syncing network status...' : `Updated ${formatDateTime(now)}`}
              </div>
              <Link
                to="/networks"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Back to networks
              </Link>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => void triggerScanMutation.mutate()}
                  disabled={triggerScanMutation.isPending}
                  className="rounded-full border border-cyan-600 bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {triggerScanMutation.isPending ? 'Triggering...' : 'Trigger Scan'}
                </button>
              ) : null}
              {isAdmin && runningScan ? (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={isCancellingScan}
                  className="rounded-full border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-70 dark:text-rose-200"
                >
                  {isCancellingScan ? 'Cancelling...' : 'Cancel Scan'}
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Edit
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null)
                    setShowDeleteConfirm(true)
                  }}
                  className="rounded-full border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/25 dark:text-rose-200"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>

          {hasError ? (
            <div className="mt-6 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load network details right now.
            </div>
          ) : null}

          {actionMessage ? (
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
              {actionMessage}
            </div>
          ) : null}

          {/* Active Scan Progress Section */}
          {runningScan ? (
            <div className="mt-6 rounded-2xl border border-sky-200/70 bg-sky-50/80 p-4 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-sky-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-sky-700 dark:text-sky-200">
                      Scan in progress
                    </p>
                    <p className="text-xs text-sky-600 dark:text-sky-300">
                      {runningScan.trigger_type === 'manual' ? 'Manual scan' : 'Scheduled scan'}{' '}
                      started{' '}
                      {runningScan.started_at
                        ? formatRelativeTime(parseUtcDate(runningScan.started_at), now)
                        : 'just now'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-sky-700 dark:text-sky-100">
                    {runningScan.progress_percent ?? 0}%
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sky-200/50 dark:bg-sky-800/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-400 transition-all duration-500"
                  style={{ width: `${runningScan.progress_percent ?? 0}%` }}
                />
              </div>
              {/* Progress message */}
              {runningScan.progress_message ? (
                <p className="mt-2 text-xs text-sky-600 dark:text-sky-300">
                  {runningScan.progress_message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">CIDR range</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {network?.cidr ?? '—'}
                </p>
                {network ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${
                      ipVersionStyles[ipVersionKey]
                    }`}
                  >
                    {ipVersionLabels[ipVersionKey]}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Port specification
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                {network?.port_spec ?? '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Scanner type
              </p>
              <div className="mt-2">
                {network ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold tracking-wide ${
                      scannerTypeStyles[network.scanner_type] ?? scannerTypeStyles.masscan
                    }`}
                  >
                    {scannerTypeLabels[network.scanner_type] ?? 'Masscan'}
                  </span>
                ) : (
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">—</span>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Scan protocol
              </p>
              <div className="mt-2">
                {network ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold tracking-wide ${
                      scanProtocolStyles[network.scan_protocol] ?? scanProtocolStyles.tcp
                    }`}
                  >
                    {scanProtocolLabels[network.scan_protocol] ?? 'TCP'}
                  </span>
                ) : (
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">—</span>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scanner</p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                {scanner?.name ?? (network ? 'Unknown scanner' : '—')}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {scanner?.description ?? 'Assigned scanner location'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <div className="flex gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Scan schedule
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {network?.scan_schedule || 'Manual only'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Rate (pps)
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {network?.scan_rate || 'Default'}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Last scan {lastScanLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Created</p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                {network?.created_at ? formatDateTime(parseUtcDate(network.created_at)) : '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Last updated
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                {network?.updated_at ? formatDateTime(parseUtcDate(network.updated_at)) : '—'}
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl text-slate-900 dark:text-white">Recent scans</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Last 10 scans for this network, ordered by most recent start time.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
                {lastScanDetail}
              </div>
              <Link
                to={`/scans?network_id=${parsedNetworkId}`}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                View all scans
              </Link>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <div className="grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/80 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[1fr_1.4fr_1fr_0.8fr]">
              <span>Status</span>
              <span>Timestamp</span>
              <span>Trigger</span>
              <span className="text-right">Ports</span>
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {isLoading ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  Loading scan history...
                </div>
              ) : scans.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No scans recorded for this network yet.
                </div>
              ) : (
                scans.map((scan) => {
                  const scanDateRaw = scan.completed_at ?? scan.cancelled_at ?? scan.started_at
                  const scanDate = scanDateRaw ? parseUtcDate(scanDateRaw) : null
                  const scanLabel = scanDate ? formatRelativeTime(scanDate, now) : '—'
                  const scanDetail = scanDate ? formatDateTime(scanDate) : 'Awaiting timing'
                  const statusLabel = statusLabels[scan.status] ?? 'Unknown'
                  const statusStyle = statusStyles[scan.status]

                  return (
                    <div
                      key={scan.id}
                      className="grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-[1fr_1.4fr_1fr_0.8fr]"
                    >
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
                      <div>
                        <p className="text-slate-700 dark:text-slate-200">{scanLabel}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{scanDetail}</p>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300">{scan.trigger_type}</div>
                      <div className="text-right text-slate-900 dark:text-white">
                        {scan.port_count}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </section>

        {/* Port Rules Section */}
        <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl text-slate-900 dark:text-white">Port Rules</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Define which ports are allowed or blocked for this network.
              </p>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setRuleFormError(null)
                  setRuleFormValues({ port: '', ruleType: 'allow', description: '' })
                  setShowAddRule(true)
                }}
                className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Add Rule
              </button>
            ) : null}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <div className="grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/80 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[0.8fr_0.8fr_1.5fr_0.6fr]">
              <span>Port</span>
              <span>Type</span>
              <span>Description</span>
              {isAdmin ? <span className="text-right">Actions</span> : null}
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {rulesQuery.isLoading ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  Loading port rules...
                </div>
              ) : rules.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No port rules defined for this network yet.
                </div>
              ) : (
                rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-[0.8fr_0.8fr_1.5fr_0.6fr] ${isAdmin ? '' : 'md:grid-cols-[0.8fr_0.8fr_1.5fr]'}`}
                  >
                    <div className="flex items-center">
                      <span className="font-mono text-slate-900 dark:text-white">
                        {rule.port}
                        {rule.ip ? (
                          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                            ({rule.ip})
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                          rule.rule_type === 'allow'
                            ? 'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200'
                            : 'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200'
                        }`}
                      >
                        {rule.rule_type}
                      </span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      {rule.description || '—'}
                    </div>
                    {isAdmin ? (
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setRuleFormError(null)
                            setRuleToDelete(rule)
                          }}
                          className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/25 dark:text-rose-200"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl text-slate-900 dark:text-white">
                Excluded Ports
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Ports hidden from scan results for this network.
              </p>
            </div>
          </div>

          {exclusionsQuery.isError ? (
            <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load excluded ports right now.
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <div
              className={`grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/80 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 ${
                isAdmin
                  ? 'md:grid-cols-[1.1fr_0.6fr_1.6fr_0.9fr_0.5fr]'
                  : 'md:grid-cols-[1.1fr_0.6fr_1.6fr_0.9fr]'
              }`}
            >
              <span>IP</span>
              <span>Port</span>
              <span>Reason</span>
              <span>Added</span>
              {isAdmin ? <span className="text-right">Actions</span> : null}
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {exclusionsQuery.isLoading ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  Loading excluded ports...
                </div>
              ) : exclusions.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No excluded ports defined for this network.
                </div>
              ) : (
                exclusions.map((exclusion) => (
                  <div
                    key={exclusion.id}
                    className={`grid grid-cols-1 gap-3 px-5 py-4 text-sm ${
                      isAdmin
                        ? 'md:grid-cols-[1.1fr_0.6fr_1.6fr_0.9fr_0.5fr]'
                        : 'md:grid-cols-[1.1fr_0.6fr_1.6fr_0.9fr]'
                    }`}
                  >
                    <div className="flex items-center font-mono text-slate-900 dark:text-white">
                      {exclusion.ip ?? 'Any IP'}
                    </div>
                    <div className="flex items-center font-mono text-slate-700 dark:text-slate-200">
                      {exclusion.port}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">{exclusion.reason}</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {formatDateTime(parseUtcDate(exclusion.created_at))}
                    </div>
                    {isAdmin ? (
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setExclusionError(null)
                            setExclusionToDelete(exclusion)
                          }}
                          className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/25 dark:text-rose-200"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </section>

      {/* Add Port Rule Modal */}
      {showAddRule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Add rule</p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  New port rule
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddRule(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleAddRuleSubmit}>
              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Port or range
                <input
                  type="text"
                  required
                  placeholder="e.g., 80 or 80-443"
                  value={ruleFormValues.port}
                  onChange={(event) =>
                    setRuleFormValues((prev) => ({
                      ...prev,
                      port: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Rule type
                <select
                  value={ruleFormValues.ruleType}
                  onChange={(event) =>
                    setRuleFormValues((prev) => ({
                      ...prev,
                      ruleType: event.target.value as 'allow' | 'block',
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="allow">Allow</option>
                  <option value="block">Block</option>
                </select>
              </label>

              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Description (optional)
                <input
                  type="text"
                  placeholder="e.g., HTTP/HTTPS web traffic"
                  value={ruleFormValues.description}
                  onChange={(event) =>
                    setRuleFormValues((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              {ruleFormError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {ruleFormError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddRule(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRuleMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {createRuleMutation.isPending ? 'Adding...' : 'Add rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Rule Confirmation Modal */}
      {ruleToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Delete rule
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Confirm deletion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRuleToDelete(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete the{' '}
              <span
                className={`font-semibold ${
                  ruleToDelete.rule_type === 'allow'
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : 'text-rose-600 dark:text-rose-300'
                }`}
              >
                {ruleToDelete.rule_type}
              </span>{' '}
              rule for port{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {ruleToDelete.port}
              </span>
              ? This action cannot be undone.
            </p>

            {ruleFormError ? (
              <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {ruleFormError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRuleToDelete(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteRuleMutation.mutate(ruleToDelete.id)}
                disabled={deleteRuleMutation.isPending}
                className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteRuleMutation.isPending ? 'Deleting...' : 'Delete rule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exclusionToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Delete exclusion
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Confirm deletion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExclusionToDelete(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Delete exclusion for{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {exclusionToDelete.ip ?? 'Any IP'}:{exclusionToDelete.port}
              </span>
              ? This will allow the port to appear in future scan results.
            </p>

            {exclusionError ? (
              <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {exclusionError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setExclusionToDelete(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteExclusionMutation.mutate(exclusionToDelete.id)}
                disabled={deleteExclusionMutation.isPending}
                className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteExclusionMutation.isPending ? 'Deleting...' : 'Delete exclusion'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Edit network
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Update configuration
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleEditSubmit}>
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
                  Scanner
                  <select
                    required
                    value={formValues.scannerId}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        scannerId: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="" disabled>
                      Select a scanner
                    </option>
                    {scannersQuery.data?.scanners.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
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
                  onClick={() => setShowEdit(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateNetworkMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {updateNetworkMutation.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Delete network
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Confirm deletion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              This will permanently delete the network and its associated scans and rules. This
              action cannot be undone.
            </p>

            {formError ? (
              <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {formError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteNetworkMutation.mutate()}
                disabled={deleteNetworkMutation.isPending}
                className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteNetworkMutation.isPending ? 'Deleting...' : 'Delete network'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCancelConfirm && runningScan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
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
                onClick={() => setShowCancelConfirm(false)}
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
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Keep running
              </button>
              <button
                type="button"
                onClick={() => void cancelScanMutation.mutate(runningScan.id)}
                disabled={cancelScanMutation.isPending || isCancellingScan}
                className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {cancelScanMutation.isPending || isCancellingScan ? 'Cancelling...' : 'Cancel scan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default NetworkDetail
