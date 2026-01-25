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
  NetworkListResponse,
  PolicyListResponse,
} from '../types'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const parseUtcDate = (dateStr: string) => {
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
}

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

const alertTypeLabels: Record<AlertType, string> = {
  new_port: 'New Port',
  not_allowed: 'Not Allowed',
  blocked: 'Blocked',
}

const alertTypeStyles: Record<AlertType, string> = {
  new_port: 'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  not_allowed: 'border-orange-300/50 bg-orange-500/15 text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/20 dark:text-orange-200',
  blocked: 'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
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
  const [whitelistReason, setWhitelistReason] = useState('')
  const now = new Date()

  const isAdmin = user?.role === 'admin'

  const typeFilter = searchParams.get('type') as AlertType | null
  const networkIdParam = searchParams.get('network_id')
  const networkIdFilter = networkIdParam ? Number(networkIdParam) : null
  const acknowledgedParam = searchParams.get('acknowledged')
  const presetFilter = searchParams.get('preset') ?? 'unack'

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
    if (networkIdFilter) newParams.set('network_id', String(networkIdFilter))
    if (typeFilter) newParams.set('type', typeFilter)
    setSearchParams(newParams)
    setSelectedIds(new Set())
  }

  const alertsQuery = useQuery({
    queryKey: ['alerts', typeFilter, networkIdFilter, acknowledgedFilter, presetFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (typeFilter) params.set('type', typeFilter)
      if (networkIdFilter !== null && Number.isFinite(networkIdFilter) && networkIdFilter > 0) {
        params.set('network_id', String(networkIdFilter))
      }
      if (presetFilter !== 'lastrun' && acknowledgedFilter !== null) {
        params.set('acknowledged', String(acknowledgedFilter))
      }
      params.set('limit', '200')
      return fetchJson<AlertListResponse>(`/api/alerts?${params.toString()}`, token ?? '')
    },
    enabled: Boolean(token),
    refetchInterval: 30000,
  })

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const policyQuery = useQuery({
    queryKey: ['policy'],
    queryFn: () => fetchJson<PolicyListResponse>('/api/policy', token ?? ''),
    enabled: Boolean(token),
  })

  const rawAlerts = alertsQuery.data?.alerts ?? []
  const networks = networksQuery.data?.networks ?? []
  const policyRules = policyQuery.data?.rules ?? []

  const alerts = (() => {
    if (presetFilter === 'lastrun' && rawAlerts.length > 0) {
      const mostRecent = rawAlerts.reduce((latest, alert) => {
        const alertTime = new Date(alert.created_at).getTime()
        return alertTime > latest ? alertTime : latest
      }, 0)
      const threshold = 5 * 60 * 1000
      return rawAlerts.filter((alert) => {
        const alertTime = new Date(alert.created_at).getTime()
        return mostRecent - alertTime <= threshold
      })
    }
    return rawAlerts
  })()

  const allowedSets = {
    ipKeys: new Set<string>(),
    networkKeys: new Set<string>(),
    globalIpKeys: new Set<string>(),
    globalPortKeys: new Set<string>(),
  }

  policyRules.forEach((rule) => {
    if (rule.rule_type !== 'allow') return
    if (rule.network_id === null) {
      if (rule.ip) allowedSets.globalIpKeys.add(`${rule.ip}:${rule.port}`)
      else allowedSets.globalPortKeys.add(rule.port)
    } else {
      if (rule.ip) allowedSets.ipKeys.add(`${rule.network_id}:${rule.ip}:${rule.port}`)
      else allowedSets.networkKeys.add(`${rule.network_id}:${rule.port}`)
    }
  })

  const isAllowed = (alert: Alert) => {
    if (allowedSets.globalIpKeys.has(`${alert.ip}:${alert.port}`)) return true
    if (allowedSets.globalPortKeys.has(String(alert.port))) return true
    if (alert.network_id === null) return false
    return allowedSets.ipKeys.has(`${alert.network_id}:${alert.ip}:${alert.port}`) ||
      allowedSets.networkKeys.has(`${alert.network_id}:${alert.port}`)
  }

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json() as Promise<Alert>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setActionMessage('Alert acknowledged.')
      setTimeout(() => setActionMessage(null), 3000)
    },
  })

  const unacknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${alertId}/unacknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json() as Promise<Alert>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setActionMessage('Alert reopened.')
      setTimeout(() => setActionMessage(null), 3000)
    },
  })

  const bulkAcknowledgeMutation = useMutation({
    mutationFn: async (alertIds: number[]) => {
      const response = await fetch(`${API_BASE_URL}/api/alerts/acknowledge-bulk`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify(alertIds),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json() as Promise<BulkAcknowledgeResponse>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setSelectedIds(new Set())
      const count = data.acknowledged_ids.length
      setActionMessage(`${count} alert${count !== 1 ? 's' : ''} acknowledged.`)
      setTimeout(() => setActionMessage(null), 3000)
    },
  })

  const whitelistMutation = useMutation({
    mutationFn: async ({ alert, reason }: { alert: Alert; reason: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/policy`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token ?? ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ network_id: null, ip: alert.ip, port: String(alert.port), description: reason }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      await fetch(`${API_BASE_URL}/api/alerts/${alert.id}/acknowledge`, {
        method: 'PUT',
        headers: getAuthHeaders(token ?? ''),
      })
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['policy'] })
      setActionModal(null)
      setWhitelistReason('')
      setActionMessage('Commiting security policy rule and acknowledged.')
      setTimeout(() => setActionMessage(null), 3000)
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
      whitelistMutation.mutate({ alert: actionModal.alert, reason: whitelistReason })
    }
  }

  const isLoading = alertsQuery.isLoading || networksQuery.isLoading || policyQuery.isLoading

  const updateFilter = (key: string, value: string | null) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) newParams.set(key, value)
    else newParams.delete(key)
    setSearchParams(newParams)
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(new Set(alerts.filter(a => !a.acknowledged).map(a => a.id)))
    else setSelectedIds(new Set())
  }

  const handleSelectOne = (alertId: number, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(alertId)
      else next.delete(alertId)
      return next
    })
  }

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged)
  const allUnacknowledgedSelected = unacknowledgedAlerts.length > 0 && unacknowledgedAlerts.every(a => selectedIds.has(a.id))

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-rose-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-amber-500/20 blur-[140px]" />

      <section className="relative z-10 space-y-8">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Security Alerts</p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">Alerts</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Investigate security alerts, acknowledge findings, and track resolution across your monitored networks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/" className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900">Back to dashboard</Link>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {[
              { id: 'unack', label: 'Not Acknowledged', color: 'bg-amber-500' },
              { id: 'all', label: 'All', color: 'bg-cyan-500' },
              { id: 'ack', label: 'Acknowledged', color: 'bg-emerald-500' },
              { id: 'lastrun', label: 'Last Scan', color: 'bg-violet-500' }
            ].map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${presetFilter === preset.id ? `${preset.color} text-white` : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={typeFilter ?? ''} onChange={e => updateFilter('type', e.target.value)} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              <option value="">All types</option>
              <option value="new_port">New Port</option>
              <option value="not_allowed">Not Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <select value={networkIdFilter ?? ''} onChange={e => updateFilter('network_id', e.target.value)} className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              <option value="">All networks</option>
              {networks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            {isAdmin && selectedIds.size > 0 && (
              <button
                onClick={() => bulkAcknowledgeMutation.mutate(Array.from(selectedIds))}
                disabled={bulkAcknowledgeMutation.isPending}
                className="ml-auto rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:border-emerald-500/40 dark:text-emerald-300"
              >
                {bulkAcknowledgeMutation.isPending ? 'Acknowledging...' : `Acknowledge (${selectedIds.size})`}
              </button>
            )}
          </div>

          {actionMessage && <div className="mt-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">{actionMessage}</div>}

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200/70 bg-slate-50/80 text-left text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300">
                  {isAdmin && <th className="w-10 px-4 py-3"><input type="checkbox" checked={allUnacknowledgedSelected} onChange={handleSelectAll} className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-600 dark:bg-slate-800" title="Select all unacknowledged" /></th>}
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
                  <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Loading alerts...</td></tr>
                ) : alerts.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">No alerts found.</td></tr>
                ) : (
                  alerts.map((alert) => {
                    const alertDate = parseUtcDate(alert.created_at)
                    return (
                      <tr key={alert.id} className={`text-sm transition hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${alert.acknowledged ? 'bg-white/60 dark:bg-slate-950/40' : 'bg-amber-50/50 dark:bg-amber-950/20'}`}>
                        {isAdmin && <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(alert.id)} onChange={e => handleSelectOne(alert.id, e.target.checked)} disabled={alert.acknowledged} className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-30 dark:border-slate-600 dark:bg-slate-800" /></td>}
                        <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${alertTypeStyles[alert.type] || 'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300'}`}>{alertTypeLabels[alert.type] || alert.type}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-900 dark:text-white">{alert.network_name ?? <span className="text-slate-400 dark:text-slate-500">Global</span>}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{alert.ip}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{alert.port}</td>
                        <td className="whitespace-nowrap px-4 py-3"><p className="text-slate-700 dark:text-slate-200">{formatRelativeTime(alertDate, now)}</p><p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(alertDate)}</p></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isAllowed(alert) && <span className="inline-flex items-center rounded-full border border-emerald-300/60 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">Whitelisted</span>}
                            {alert.acknowledged ? (
                              isAdmin ? (
                                <button onClick={() => unacknowledgeMutation.mutate(alert.id)} disabled={unacknowledgeMutation.isPending} title="Click to reopen" className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/25 disabled:opacity-60 dark:border-emerald-400/40 dark:text-emerald-200">Acknowledged ✓</button>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200">Acknowledged ✓</span>
                              )
                            ) : isAdmin ? (
                              <button onClick={() => setActionModal({ alert })} className="rounded-full border border-amber-300 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 dark:border-amber-500/50 dark:text-amber-200">Resolve</button>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200">Pending</span>
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
        </div>
      </section>

      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200/70 bg-white p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Resolve Alert</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{actionModal.alert.ip}:{actionModal.alert.port}</h3>
              </div>
              <button onClick={() => { setActionModal(null); setWhitelistReason(''); }} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="mb-6 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Justification / Reason</label>
              <input
                type="text"
                autoFocus
                value={whitelistReason}
                onChange={(e) => setWhitelistReason(e.target.value)}
                placeholder="Required for whitelisting..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="space-y-3">
              <div className="group rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 transition-all hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                    ✅
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-emerald-700 dark:text-emerald-200">Whitelist Globally</p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-300/70">Clear alert and allow on all networks</p>
                  </div>
                </div>
                <button
                  onClick={handleWhitelist}
                  disabled={!whitelistReason.trim() || acknowledgeMutation.isPending || whitelistMutation.isPending}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-emerald-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                >
                  {whitelistMutation.isPending ? 'Processing...' : 'Whitelist'}
                </button>
              </div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-slate-800"></div></div>
                <div className="relative flex justify-center"><span className="bg-white px-3 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 dark:bg-slate-900">Alternative</span></div>
              </div>

              <button
                onClick={handleAcknowledgeOnly}
                disabled={acknowledgeMutation.isPending || whitelistMutation.isPending}
                className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600 dark:bg-slate-800">
                  👁️
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Just Acknowledge</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mark as reviewed without whitelist</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Alerts
