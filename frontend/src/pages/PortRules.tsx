import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import { Toast } from '../components/Toast'
import { useToast } from '../lib/useToast'
import type {
  NetworkListResponse,
  PortRuleUnified,
  PortRuleUnifiedCreatePayload,
  PortRuleUnifiedListResponse,
} from '../types'

type SortKey = 'scope' | 'port' | 'type'
type SortDirection = 'asc' | 'desc'

const ruleKey = (rule: PortRuleUnified): string =>
  `${rule.network_id === null ? 'global' : 'network'}-${rule.id}`

const emptyNewRule = (): PortRuleUnifiedCreatePayload => ({
  network_id: null,
  ip: null,
  port: '',
  rule_type: 'accepted',
  description: null,
  source: 'port',
})

type RuleEditForm = {
  ip: string
  port: string
  rule_type: 'accepted' | 'critical'
  description: string
}

const buildEditForm = (rule: PortRuleUnified): RuleEditForm => ({
  ip: rule.ip ?? '',
  port: rule.port,
  rule_type: rule.rule_type,
  description: rule.description ?? '',
})

const PortRules = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const [networkFilter, setNetworkFilter] = useState<number | ''>('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'port' | 'ssh'>('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('port')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<RuleEditForm | null>(null)
  const { toast, showToast } = useToast()

  // Create form state
  const [newRule, setNewRule] = useState<PortRuleUnifiedCreatePayload>(emptyNewRule)

  const rulesQuery = useQuery({
    queryKey: ['port-rules', networkFilter],
    queryFn: () => {
      const params = networkFilter ? `?network_id=${networkFilter}` : ''
      return fetchJson<PortRuleUnifiedListResponse>(`/api/port-rules${params}`, token ?? '')
    },
    enabled: !!token,
  })

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: !!token,
  })

  const rules = useMemo(() => rulesQuery.data?.rules ?? [], [rulesQuery.data])

  const filteredRules = useMemo(() => {
    let result = rules
    if (sourceFilter !== 'all') {
      result = result.filter((r) => (r.source ?? 'port') === sourceFilter)
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(
        (r) =>
          r.port.toLowerCase().includes(q) ||
          (r.ip ?? '').toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.network_name ?? 'global').toLowerCase().includes(q) ||
          r.rule_type.toLowerCase().includes(q) ||
          (r.source ?? 'port').toLowerCase().includes(q),
      )
    }
    return [...result].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'scope': {
          const aVal = a.network_name ?? 'Global'
          const bVal = b.network_name ?? 'Global'
          return dir * aVal.localeCompare(bVal)
        }
        case 'port':
          return dir * a.port.localeCompare(b.port, undefined, { numeric: true })
        case 'type':
          return dir * a.rule_type.localeCompare(b.rule_type)
        default:
          return 0
      }
    })
  }, [rules, sourceFilter, searchTerm, sortKey, sortDirection])

  // Clear selection when filters/sort change
  useEffect(() => {
    setSelectedRules(new Set())
  }, [searchTerm, sortKey, sortDirection, networkFilter, sourceFilter])

  const createMutation = useMutation({
    mutationFn: async (payload: PortRuleUnifiedCreatePayload) => {
      const res = await fetch(`${API_BASE_URL}/api/port-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-rules'] })
      setShowCreateForm(false)
      setNewRule(emptyNewRule())
      showToast('Rule created', 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      scope,
      ruleId,
      payload,
    }: {
      scope: 'global' | 'network'
      ruleId: number
      payload: {
        ip: string
        port: string
        rule_type: 'accepted' | 'critical'
        description: string | null
      }
    }) => {
      const res = await fetch(`${API_BASE_URL}/api/port-rules/${scope}/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-rules'] })
      setEditingRuleKey(null)
      setEditForm(null)
      showToast('Rule updated', 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ scope, ruleId }: { scope: 'global' | 'network'; ruleId: number }) => {
      const res = await fetch(`${API_BASE_URL}/api/port-rules/${scope}/${ruleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-rules'] })
      showToast('Rule deleted', 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      await Promise.all(
        keys.map((key) => {
          const dashIdx = key.indexOf('-')
          const scope = key.slice(0, dashIdx) as 'global' | 'network'
          const id = key.slice(dashIdx + 1)
          return fetch(`${API_BASE_URL}/api/port-rules/${scope}/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(token ?? ''),
          }).then((res) => {
            if (!res.ok) throw new Error(`Failed to delete rule ${id}`)
          })
        }),
      )
    },
    onSuccess: (_data, keys) => {
      queryClient.invalidateQueries({ queryKey: ['port-rules'] })
      setSelectedRules(new Set())
      showToast(`Deleted ${keys.length} rules`, 'success')
    },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Error', 'error'),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (newRule.source !== 'ssh' && !newRule.port.trim()) return
    createMutation.mutate({
      ...newRule,
      ip: newRule.ip?.trim() || null,
      description: newRule.description?.trim() || null,
    })
  }

  const handleDelete = (rule: PortRuleUnified) => {
    const scope = rule.network_id === null ? 'global' : 'network'
    const portInfo = rule.port ? ` for port ${rule.port}` : ''
    if (!confirm(`Delete this ${scope} ${rule.source ?? 'port'} rule${portInfo}?`)) return
    deleteMutation.mutate({ scope, ruleId: rule.id })
  }

  const handleEditStart = (rule: PortRuleUnified) => {
    setEditingRuleKey(ruleKey(rule))
    setEditForm(buildEditForm(rule))
  }

  const handleEditCancel = () => {
    setEditingRuleKey(null)
    setEditForm(null)
  }

  const handleEditSave = (rule: PortRuleUnified) => {
    if (!editForm) return
    if (rule.source !== 'ssh' && !editForm.port.trim()) return

    updateMutation.mutate({
      scope: rule.network_id === null ? 'global' : 'network',
      ruleId: rule.id,
      payload: {
        ip: editForm.ip.trim(),
        port: editForm.port.trim(),
        rule_type: editForm.rule_type,
        description: editForm.description.trim() || null,
      },
    })
  }

  const handleBulkDelete = () => {
    if (selectedRules.size === 0) return
    if (!confirm(`Delete ${selectedRules.size} selected rules?`)) return
    bulkDeleteMutation.mutate(Array.from(selectedRules))
  }

  const toggleSelected = (key: string) =>
    setSelectedRules((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const toggleSelectAll = () => {
    if (selectedRules.size === filteredRules.length) {
      setSelectedRules(new Set())
    } else {
      setSelectedRules(new Set(filteredRules.map(ruleKey)))
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
      className="flex items-center gap-1 font-semibold uppercase text-[11px] tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
    >
      {label} {sortKey === key && (sortDirection === 'asc' ? '↑' : '↓')}
    </button>
  )

  const colSpan = isAdmin ? 8 : 6

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
      <Toast toast={toast} />

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="font-display text-4xl text-slate-900 dark:text-white leading-none">
            Alert Rules
          </h1>
          <p className="text-indigo-500 mt-3 uppercase text-[11px] font-semibold tracking-[0.3em] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Global &amp; Network Alert Policies
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && selectedRules.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="px-5 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-xs font-semibold uppercase tracking-widest transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {bulkDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedRules.size}`}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-semibold uppercase tracking-widest transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Rule
            </button>
          )}
        </div>
      </header>

      {/* Create form */}
      {showCreateForm && isAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm p-6">
          <h2 className="font-display text-lg text-slate-900 dark:text-white mb-6">
            New Rule
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-7 gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Source
              </label>
              <select
                value={newRule.source ?? 'port'}
                onChange={(e) => setNewRule({ ...newRule, source: e.target.value })}
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
              >
                <option value="port">Port</option>
                <option value="ssh">SSH</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Scope
              </label>
              <select
                value={newRule.network_id ?? ''}
                onChange={(e) =>
                  setNewRule({
                    ...newRule,
                    network_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
              >
                <option value="">Global</option>
                {(networksQuery.data?.networks ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                IP (optional)
              </label>
              <input
                type="text"
                value={newRule.ip ?? ''}
                onChange={(e) => setNewRule({ ...newRule, ip: e.target.value || null })}
                placeholder="Any IP"
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Port {newRule.source !== 'ssh' && '*'}
              </label>
              <input
                type="text"
                value={newRule.port}
                onChange={(e) => setNewRule({ ...newRule, port: e.target.value })}
                placeholder="e.g. 443"
                required={newRule.source !== 'ssh'}
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Type
              </label>
              <select
                value={newRule.rule_type}
                onChange={(e) =>
                  setNewRule({ ...newRule, rule_type: e.target.value as 'accepted' | 'critical' })
                }
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
              >
                <option value="accepted">Accepted</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Description
              </label>
              <input
                type="text"
                value={newRule.description ?? ''}
                onChange={(e) => setNewRule({ ...newRule, description: e.target.value || null })}
                placeholder="Optional"
                className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search + Stats + Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2">
            Search Rules
          </p>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Port, IP, description, network..."
            className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
          />
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            Total Rules
          </p>
          <p className="text-5xl font-semibold mt-2 text-indigo-600">
            {rules.length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            Global / Network
          </p>
          <p className="text-5xl font-semibold mt-2">
            <span className="text-violet-600">
              {rules.filter((r) => r.network_id === null).length}
            </span>
            <span className="text-slate-300 dark:text-slate-700 mx-2">/</span>
            <span className="text-cyan-600">
              {rules.filter((r) => r.network_id !== null).length}
            </span>
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2">
            Filter by Network
          </p>
          <select
            value={networkFilter}
            onChange={(e) => setNetworkFilter(e.target.value ? Number(e.target.value) : '')}
            className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
          >
            <option value="">All (Global + Network)</option>
            {(networksQuery.data?.networks ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2">
            Filter by Source
          </p>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | 'port' | 'ssh')}
            className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
          >
            <option value="all">All Sources</option>
            <option value="port">Port</option>
            <option value="ssh">SSH</option>
          </select>
        </div>
      </div>

      {/* Rules table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-50 dark:border-slate-800/50 bg-white dark:bg-slate-900">
                {isAdmin && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredRules.length > 0 && selectedRules.size === filteredRules.length
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-2 border-slate-200 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-6 py-3">{renderSort('Scope', 'scope')}</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Source
                </th>
                <th className="px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  IP
                </th>
                <th className="px-6 py-3">{renderSort('Port', 'port')}</th>
                <th className="px-6 py-3">{renderSort('Type', 'type')}</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Description
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30">
              {rulesQuery.isLoading ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-12 text-center text-sm text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="px-6 py-12 text-center text-sm text-slate-400 italic"
                  >
                    {searchTerm.trim() ? 'No rules match your search' : 'No alert rules found'}
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  const isGlobal = rule.network_id === null
                  const key = ruleKey(rule)
                  const isSelected = selectedRules.has(key)
                  const isEditing = editingRuleKey === key && editForm !== null
                  return (
                    <tr
                      key={key}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors ${
                        isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                      }`}
                    >
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(key)}
                            className="w-4 h-4 rounded border-2 border-slate-200 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-3">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            isGlobal
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                              : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
                          }`}
                        >
                          {rule.network_name ?? 'Global'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            rule.source === 'ssh'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                              : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
                          }`}
                        >
                          {rule.source === 'ssh' ? 'SSH' : 'Port'}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-mono text-sm text-slate-700 dark:text-slate-300">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.ip}
                            onChange={(e) =>
                              setEditForm((current) =>
                                current ? { ...current, ip: e.target.value } : current,
                              )
                            }
                            placeholder="Any IP"
                            className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
                          />
                        ) : (
                          rule.ip || (
                            <span className="text-slate-300 dark:text-slate-600 italic">Any</span>
                          )
                        )}
                      </td>
                      <td className="px-6 py-3 font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.port}
                            onChange={(e) =>
                              setEditForm((current) =>
                                current ? { ...current, port: e.target.value } : current,
                              )
                            }
                            placeholder={rule.source === 'ssh' ? 'Optional' : 'e.g. 443'}
                            className="w-full min-w-24 bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
                          />
                        ) : (
                          rule.port
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {isEditing ? (
                          <select
                            value={editForm.rule_type}
                            onChange={(e) =>
                              setEditForm((current) =>
                                current
                                  ? {
                                      ...current,
                                      rule_type: e.target.value as 'accepted' | 'critical',
                                    }
                                  : current,
                              )
                            }
                            className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
                          >
                            <option value="accepted">Accepted</option>
                            <option value="critical">Critical</option>
                          </select>
                        ) : (
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              rule.rule_type === 'accepted'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                            }`}
                          >
                            {rule.rule_type}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((current) =>
                                current ? { ...current, description: e.target.value } : current,
                              )
                            }
                            placeholder="Optional"
                            className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:ring-4 ring-indigo-500/5 focus:border-indigo-500/30 outline-none transition-all"
                          />
                        ) : (
                          rule.description || '-'
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleEditSave(rule)}
                                  disabled={updateMutation.isPending}
                                  className="rounded-lg border border-emerald-200 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={handleEditCancel}
                                  disabled={updateMutation.isPending}
                                  className="rounded-lg border border-slate-200 bg-slate-500/10 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-500/20 dark:border-slate-700 dark:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleEditStart(rule)}
                                  disabled={updateMutation.isPending}
                                  className="rounded-lg border border-indigo-200 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(rule)}
                                  disabled={deleteMutation.isPending}
                                  className="rounded-lg border border-rose-200 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-500/20 dark:border-rose-500/40 dark:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default PortRules
