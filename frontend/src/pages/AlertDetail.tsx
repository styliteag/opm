import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AlertComments from '../components/AlertComments'
import InlineRuleEditor from '../components/InlineRuleEditor'
import ReviewModal from '../components/ReviewModal'
import { Toast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import { parseUtcDate, formatDateTime, formatRelativeTime } from '../lib/formatters'
import { useToast } from '../lib/useToast'
import type {
  Alert,
  AlertListResponse,
  GlobalOpenPort,
  GlobalOpenPortListResponse,
  HostNetworkInfo,
  NetworkListResponse,
  PortRuleUnified,
  PortRuleUnifiedListResponse,
} from '../types'

type Severity = 'critical' | 'high' | 'medium' | 'info'

const severityStyles: Record<Severity, string> = {
  critical: 'border-rose-500/50 bg-rose-500/20 text-rose-700 dark:text-rose-200',
  high: 'border-orange-400/50 bg-orange-500/15 text-orange-700 dark:text-orange-200',
  medium: 'border-amber-400/50 bg-amber-500/15 text-amber-700 dark:text-amber-200',
  info: 'border-slate-300/50 bg-slate-200/40 text-slate-600 dark:text-slate-300',
}

const severityLabels: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  info: 'Info',
}

const alertTypeLabels: Record<string, string> = {
  new_port: 'New Port Detected',
  not_allowed: 'Port Not Allowed',
  blocked: 'Blocked Port Open',
  ssh_insecure_auth: 'SSH Insecure Auth',
  ssh_weak_cipher: 'SSH Weak Cipher',
  ssh_weak_kex: 'SSH Weak Key Exchange',
  ssh_outdated_version: 'SSH Outdated Version',
  ssh_config_regression: 'SSH Config Regression',
}

function RuleCard({
  rule,
  allRules,
  isAdmin,
  onEdit,
  onDelete,
  isDeleting,
}: {
  rule: Alert['matching_rules'][0]
  allRules: PortRuleUnified[]
  isAdmin: boolean
  onEdit: (rule: PortRuleUnified) => void
  onDelete: (scope: 'global' | 'network', ruleId: number) => void
  isDeleting: boolean
}) {
  const fullRule = allRules.find(
    (r) =>
      r.id === rule.id &&
      (rule.scope === 'global' ? r.network_id === null : r.network_id === rule.network_id),
  )

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/60 p-4 dark:border-slate-700/70 dark:bg-slate-800/60">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                rule.rule_type === 'accepted'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
              }`}
            >
              {rule.rule_type}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {rule.scope === 'global' ? 'Global' : (rule.network_name ?? 'Network')}
            </span>
            {rule.ip && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                IP: {rule.ip}
              </span>
            )}
            {fullRule && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Port: {fullRule.port}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {rule.description || <span className="italic text-slate-400">No description</span>}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {fullRule && (
              <button
                onClick={() => onEdit(fullRule)}
                className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
              >
                Edit
              </button>
            )}
            <button
              onClick={() => onDelete(rule.scope, rule.id)}
              disabled={isDeleting}
              className="rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function RuleEditModal({
  rule,
  onSave,
  onClose,
  isSaving,
}: {
  rule: PortRuleUnified
  onSave: (payload: {
    scope: 'global' | 'network'
    ruleId: number
    ip?: string | null
    port?: string
    rule_type?: 'accepted' | 'critical'
    description?: string | null
  }) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [ip, setIp] = useState(rule.ip ?? '')
  const [port, setPort] = useState(rule.port)
  const [ruleType, setRuleType] = useState<'accepted' | 'critical'>(rule.rule_type)
  const [description, setDescription] = useState(rule.description ?? '')

  const scope: 'global' | 'network' = rule.network_id === null ? 'global' : 'network'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4">
      <div className="bg-white dark:bg-slate-900 p-12 rounded-[3rem] w-full max-w-xl border border-slate-100 dark:border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]">
        <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">
          Edit Rule
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {scope === 'global' ? 'Global rule' : `Network: ${rule.network_name}`}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSave({
              scope,
              ruleId: rule.id,
              ip: ip.trim() || null,
              port: port.trim(),
              rule_type: ruleType,
              description: description.trim() || null,
            })
          }}
          className="mt-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Port
              </label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="80 or 80-443"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-mono text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                IP (optional)
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="Any IP"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-mono text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Type
            </label>
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as 'accepted' | 'critical')}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="accepted">Accepted</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Known web server"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-[0.2em] transition-all px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !port.trim()}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AlertDetail() {
  const { alertId } = useParams()
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const { toast, showToast } = useToast()
  const isAdmin = user?.role === 'admin'
  const parsedId = Number(alertId)
  const isValidId = Number.isFinite(parsedId) && parsedId > 0

  const [showRuleEditor, setShowRuleEditor] = useState(false)
  const [editingRule, setEditingRule] = useState<PortRuleUnified | null>(null)
  const [reviewModal, setReviewModal] = useState(false)

  // Fetch the single alert
  const alertQuery = useQuery({
    queryKey: ['alert', parsedId],
    queryFn: () => fetchJson<Alert>(`/api/alerts/${parsedId}`, token ?? ''),
    enabled: Boolean(token) && isValidId,
  })

  // Fetch all alert IDs for prev/next navigation
  const allAlertsQuery = useQuery({
    queryKey: ['alerts', 'all'],
    queryFn: () => fetchJson<AlertListResponse>('/api/alerts?limit=200', token ?? ''),
    enabled: Boolean(token),
  })

  // Fetch port rules for editing
  const rulesQuery = useQuery({
    queryKey: ['port-rules'],
    queryFn: () => fetchJson<PortRuleUnifiedListResponse>('/api/port-rules', token ?? ''),
    enabled: Boolean(token),
  })

  // Fetch networks for rule editor
  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  // Fetch global ports for service info
  const globalPortsQuery = useQuery({
    queryKey: ['global-ports'],
    queryFn: () => fetchJson<GlobalOpenPortListResponse>('/api/global-ports', token ?? ''),
    enabled: Boolean(token),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
    queryClient.invalidateQueries({ queryKey: ['alert'] })
    queryClient.invalidateQueries({ queryKey: ['port-rules'] })
  }

  // Mutations
  const dismissMutation = useMutation({
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
    onSuccess: invalidateAll,
  })

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

  const reopenMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/reopen`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
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

  const updateRuleMutation = useMutation({
    mutationFn: async ({
      scope,
      ruleId,
      ...payload
    }: {
      scope: 'global' | 'network'
      ruleId: number
      ip?: string | null
      port?: string
      rule_type?: 'accepted' | 'critical'
      description?: string | null
    }) => {
      const res = await fetch(`${API_BASE_URL}/api/port-rules/${scope}/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: invalidateAll,
  })

  const deleteRuleMutation = useMutation({
    mutationFn: async ({ scope, ruleId }: { scope: 'global' | 'network'; ruleId: number }) => {
      const res = await fetch(`${API_BASE_URL}/api/port-rules/${scope}/${ruleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
    },
    onSuccess: invalidateAll,
  })

  const rescanMutation = useMutation({
    mutationFn: async (hostIp: string) => {
      const res = await fetch(`${API_BASE_URL}/api/hosts/${encodeURIComponent(hostIp)}/rescan`, {
        method: 'POST',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
  })

  // Navigation
  const allAlertIds = (allAlertsQuery.data?.alerts ?? []).map((a) => a.id)
  const currentIndex = allAlertIds.indexOf(parsedId)
  const prevId = currentIndex > 0 ? allAlertIds[currentIndex - 1] : null
  const nextId =
    currentIndex >= 0 && currentIndex < allAlertIds.length - 1
      ? allAlertIds[currentIndex + 1]
      : null

  const alert = alertQuery.data
  const networks: HostNetworkInfo[] = (networksQuery.data?.networks ?? []).map((n) => ({
    id: n.id,
    name: n.name,
    cidr: n.cidr,
  }))
  const allRules = rulesQuery.data?.rules ?? []

  // Find port data
  const portData: GlobalOpenPort | null = alert?.global_open_port_id
    ? ((globalPortsQuery.data?.ports ?? []).find((p) => p.id === alert.global_open_port_id) ?? null)
    : null

  const now = new Date()
  const isProcessing =
    dismissMutation.isPending ||
    acceptGloballyMutation.isPending ||
    acceptInNetworkMutation.isPending

  if (!isValidId) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">Invalid alert ID.</p>
        <Link
          to="/alerts"
          className="text-indigo-600 dark:text-indigo-400 hover:underline mt-2 inline-block"
        >
          Back to Alerts
        </Link>
      </div>
    )
  }

  if (alertQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="h-40 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-60 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>
    )
  }

  if (alertQuery.isError || !alert) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">
          {alertQuery.error?.message ?? 'Alert not found'}
        </p>
        <Link
          to="/alerts"
          className="text-indigo-600 dark:text-indigo-400 hover:underline mt-2 inline-block"
        >
          Back to Alerts
        </Link>
      </div>
    )
  }

  const severity = alert.severity as Severity
  const alertDate = parseUtcDate(alert.created_at)

  const getServiceName = (
    serviceGuess: string | null | undefined,
    banner: string | null | undefined,
  ) => {
    if (serviceGuess) return serviceGuess
    if (banner) {
      const firstWord = banner.split(' ')[0]
      if (firstWord) return firstWord
    }
    return 'Unknown Service'
  }

  // Determine effective rule status for this alert
  const getEffectiveStatus = (): 'accepted' | 'critical' | null => {
    if (alert.matching_rules.length === 0) return null
    // Tier 1: IP-specific
    const ipRules = alert.matching_rules.filter((r) => r.ip !== null)
    if (ipRules.length > 0) {
      return ipRules.some((r) => r.rule_type === 'accepted') ? 'accepted' : 'critical'
    }
    // Tier 2: port-only
    const portRules = alert.matching_rules.filter((r) => r.ip === null)
    if (portRules.length > 0) {
      return portRules.some((r) => r.rule_type === 'accepted') ? 'accepted' : 'critical'
    }
    return null
  }
  const effectiveStatus = getEffectiveStatus()
  const isAccepted = effectiveStatus === 'accepted'

  return (
    <div className="relative">
      <Toast toast={toast} />

      <section className="relative z-10 space-y-6 p-6">
        {/* Breadcrumb + Prev/Next navigation */}
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Link
              to="/alerts"
              className="hover:text-slate-700 dark:hover:text-slate-200 transition"
            >
              Alerts
            </Link>
            <span>/</span>
            <span className="text-slate-900 dark:text-white font-mono">#{alert.id}</span>
          </nav>
          <div className="flex items-center gap-2">
            {currentIndex >= 0 && (
              <span className="text-xs text-slate-400 mr-2">
                {currentIndex + 1} of {allAlertIds.length}
              </span>
            )}
            <button
              onClick={() => prevId && navigate(`/alerts/${prevId}`)}
              disabled={prevId === null}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous alert"
            >
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Prev
              </span>
            </button>
            <button
              onClick={() => nextId && navigate(`/alerts/${nextId}`)}
              disabled={nextId === null}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next alert"
            >
              <span className="flex items-center gap-1">
                Next
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </button>
          </div>
        </div>

        {/* Alert Header Card */}
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${severityStyles[severity]}`}
                >
                  {severityLabels[severity]}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {alertTypeLabels[alert.type] ?? alert.type}
                </span>
                {alert.dismissed && (
                  <span className="inline-flex items-center rounded-full border border-sky-300/50 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-200">
                    Dismissed
                  </span>
                )}
                {isAccepted && (
                  <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                    Accepted
                  </span>
                )}
              </div>
              <h2 className="font-display text-2xl text-slate-900 dark:text-white">
                {alert.message}
              </h2>
              <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                    {alert.host_id ? (
                      <Link
                        to={`/hosts/${alert.host_id}`}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {alert.ip}
                      </Link>
                    ) : (
                      alert.ip
                    )}
                  </span>
                  :{' '}
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                    {alert.port}
                  </span>
                </span>
                {alert.hostname && (
                  <span className="text-indigo-600 dark:text-indigo-400">{alert.hostname}</span>
                )}
                {alert.network_name && (
                  <span>
                    Network:{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {alert.network_name}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <button
                  onClick={() =>
                    rescanMutation.mutate(alert.ip, {
                      onSuccess: () => showToast(`Rescan started for ${alert.ip}`, 'success'),
                      onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
                    })
                  }
                  disabled={rescanMutation.isPending}
                  className="rounded-full border border-cyan-300 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-700 transition hover:border-cyan-400 hover:bg-cyan-500/20 dark:border-cyan-500/40 dark:text-cyan-200 disabled:opacity-50"
                >
                  {rescanMutation.isPending ? 'Scanning...' : 'Rescan'}
                </button>
              )}
              {alert.dismissed && isAdmin && (
                <button
                  onClick={() =>
                    reopenMutation.mutate(parsedId, {
                      onSuccess: () => showToast('Alert reopened', 'success'),
                      onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
                    })
                  }
                  disabled={reopenMutation.isPending}
                  className="rounded-full border border-slate-200 bg-slate-100/50 px-4 py-2 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:text-rose-400 disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
              {!alert.dismissed && isAdmin && (
                <button
                  onClick={() => setReviewModal(true)}
                  className="rounded-full border border-emerald-300 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300"
                >
                  Accept
                </button>
              )}
            </div>
          </div>

          {/* Metadata grid */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800/50">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
                Created
              </p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {formatRelativeTime(alertDate, now)}
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(alertDate)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
                Status
              </p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 capitalize">
                {alert.resolution_status}
              </p>
            </div>
            {alert.assigned_to_email && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
                  Assigned To
                </p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {alert.assigned_to_email}
                </p>
              </div>
            )}
            {alert.dismiss_reason && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
                  Dismiss Reason
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{alert.dismiss_reason}</p>
              </div>
            )}
            {alert.user_comment && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
                  Host Comment
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                  {alert.user_comment}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Service & SSH Details */}
          <div className="space-y-6">
            {/* Service Detection */}
            {portData && (
              <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
                <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.25em] mb-4">
                  Service Detection
                </h3>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {getServiceName(portData.service_guess, portData.banner)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Protocol: {portData.protocol.toUpperCase()}
                </p>
                <div className="grid grid-cols-2 gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                      First Seen
                    </p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {formatDateTime(parseUtcDate(portData.first_seen_at))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                      Last Seen
                    </p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {formatDateTime(parseUtcDate(portData.last_seen_at))}
                    </p>
                  </div>
                </div>
                {portData.banner && (
                  <div className="mt-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3">
                      Application Banner
                    </p>
                    <div className="bg-slate-950 rounded-2xl p-6 overflow-hidden border border-slate-800 relative shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]">
                      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 opacity-60" />
                      <pre className="text-[11px] font-mono text-emerald-400/80 whitespace-pre-wrap leading-loose select-all italic">
                        {portData.banner}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SSH Security */}
            {alert.ssh_summary && (
              <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">
                  SSH Security
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        alert.ssh_summary.publickey_enabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      PubKey: {alert.ssh_summary.publickey_enabled ? 'On' : 'Off'}
                    </span>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        alert.ssh_summary.password_enabled
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}
                    >
                      Password: {alert.ssh_summary.password_enabled ? 'On' : 'Off'}
                    </span>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        alert.ssh_summary.keyboard_interactive_enabled
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}
                    >
                      KbdInt: {alert.ssh_summary.keyboard_interactive_enabled ? 'On' : 'Off'}
                    </span>
                    {alert.ssh_summary.has_weak_ciphers && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        Weak Ciphers
                      </span>
                    )}
                    {alert.ssh_summary.has_weak_kex && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        Weak KEX
                      </span>
                    )}
                  </div>
                  {alert.ssh_summary.ssh_version && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                      {alert.ssh_summary.ssh_version}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    Last scanned: {formatDateTime(parseUtcDate(alert.ssh_summary.last_scanned))}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Matching Rules & Rule Editor */}
          <div className="space-y-6">
            {/* Matching Rules */}
            <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
                  Matching Rules
                </h3>
                {effectiveStatus && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      effectiveStatus === 'accepted'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                    }`}
                  >
                    Effective: {effectiveStatus}
                  </span>
                )}
              </div>

              {alert.matching_rules.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No rules match this alert.
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Create a rule below to accept or mark this port as critical.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alert.matching_rules.map((rule) => (
                    <RuleCard
                      key={`${rule.scope}-${rule.id}`}
                      rule={rule}
                      allRules={allRules}
                      isAdmin={isAdmin}
                      onEdit={(fullRule) => setEditingRule(fullRule)}
                      onDelete={(scope, ruleId) =>
                        deleteRuleMutation.mutate(
                          { scope, ruleId },
                          {
                            onSuccess: () => showToast('Rule deleted', 'success'),
                            onError: (e) =>
                              showToast(e instanceof Error ? e.message : 'Error', 'error'),
                          },
                        )
                      }
                      isDeleting={deleteRuleMutation.isPending}
                    />
                  ))}
                </div>
              )}

              {/* Specificity explanation */}
              {alert.matching_rules.length > 1 && (
                <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-500 dark:text-slate-400">
                  <p className="font-semibold mb-1">How rules are resolved:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>IP-specific rules override port-only rules</li>
                    <li>At the same specificity, "accepted" wins over "critical"</li>
                  </ul>
                </div>
              )}

              {/* Create new rule */}
              {isAdmin && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                  {showRuleEditor ? (
                    <InlineRuleEditor
                      ip={alert.ip}
                      port={alert.port}
                      networks={networks}
                      onSave={(payload) => {
                        createRuleMutation.mutate(payload, {
                          onSuccess: () => {
                            showToast('Rule created', 'success')
                            setShowRuleEditor(false)
                          },
                          onError: (e) =>
                            showToast(e instanceof Error ? e.message : 'Error', 'error'),
                        })
                      }}
                      onCancel={() => setShowRuleEditor(false)}
                      isSaving={createRuleMutation.isPending}
                    />
                  ) : (
                    <button
                      onClick={() => setShowRuleEditor(true)}
                      className="w-full rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-3 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/5 dark:text-indigo-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10"
                    >
                      + Create a More Specific Rule
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Comments section */}
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">
            Comments
          </h3>
          <AlertComments alertId={alert.id} onToast={(message, tone) => showToast(message, tone)} />
        </div>
      </section>

      {/* Review Modal */}
      {reviewModal && (
        <ReviewModal
          alerts={[
            {
              id: alert.id,
              ip: alert.ip,
              port: alert.port,
              network_id: alert.network_id,
              network_name: alert.network_name,
              related_ssh_alert_count: alert.related_ssh_alert_count,
              related_ssh_alerts_dismissed: alert.related_ssh_alerts_dismissed,
            },
          ]}
          mode="single"
          onDismiss={(reason, includeSSH) => {
            dismissMutation.mutate(
              {
                alertId: alert.id,
                reason: reason || undefined,
                include_ssh_findings: alert.related_ssh_alert_count > 0 && includeSSH,
              },
              {
                onSuccess: () => {
                  showToast('Alert dismissed.', 'success')
                  setReviewModal(false)
                },
              },
            )
          }}
          onAcceptGlobal={(reason) => {
            if (!reason.trim()) return
            acceptGloballyMutation.mutate(
              { alertIds: [alert.id], reason },
              {
                onSuccess: () => {
                  showToast('Accepted globally.', 'success')
                  setReviewModal(false)
                },
              },
            )
          }}
          onAcceptNetwork={(reason) => {
            if (!reason.trim()) return
            acceptInNetworkMutation.mutate(
              { alertIds: [alert.id], reason },
              {
                onSuccess: () => {
                  showToast('Accepted in network.', 'success')
                  setReviewModal(false)
                },
              },
            )
          }}
          onClose={() => setReviewModal(false)}
          isProcessing={isProcessing}
        />
      )}

      {/* Rule Edit Modal */}
      {editingRule && (
        <RuleEditModal
          rule={editingRule}
          onSave={(payload) => {
            updateRuleMutation.mutate(payload, {
              onSuccess: () => {
                showToast('Rule updated', 'success')
                setEditingRule(null)
              },
              onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
            })
          }}
          onClose={() => setEditingRule(null)}
          isSaving={updateRuleMutation.isPending}
        />
      )}
    </div>
  )
}
