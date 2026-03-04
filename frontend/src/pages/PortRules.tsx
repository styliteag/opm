import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type {
  NetworkListResponse,
  PortRuleUnified,
  PortRuleUnifiedCreatePayload,
  PortRuleUnifiedListResponse,
} from '../types'

const PortRules = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const [networkFilter, setNetworkFilter] = useState<number | ''>('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  // Create form state
  const [newRule, setNewRule] = useState<PortRuleUnifiedCreatePayload>({
    network_id: null,
    ip: null,
    port: '',
    rule_type: 'accepted',
    description: null,
  })

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

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
      setNewRule({ network_id: null, ip: null, port: '', rule_type: 'accepted', description: null })
      setToast({ message: 'Rule created', tone: 'success' })
    },
    onError: (e) => setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' }),
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
      setToast({ message: 'Rule deleted', tone: 'success' })
    },
    onError: (e) => setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' }),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRule.port.trim()) return
    createMutation.mutate({
      ...newRule,
      ip: newRule.ip?.trim() || null,
      description: newRule.description?.trim() || null,
    })
  }

  const handleDelete = (rule: PortRuleUnified) => {
    const scope = rule.network_id === null ? 'global' : 'network'
    if (!confirm(`Delete this ${scope} rule for port ${rule.port}?`)) return
    deleteMutation.mutate({ scope, ruleId: rule.id })
  }

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
            Port Rules
          </h1>
          <p className="text-indigo-500 mt-3 uppercase text-[11px] font-black tracking-[0.3em] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Global &amp; Network Port Policies
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Rule
            </button>
          )}
        </div>
      </header>

      {/* Create form */}
      {showCreateForm && isAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm p-8">
          <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mb-6">
            New Port Rule
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Scope
              </label>
              <select
                value={newRule.network_id ?? ''}
                onChange={(e) =>
                  setNewRule({ ...newRule, network_id: e.target.value ? Number(e.target.value) : null })
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
                Port *
              </label>
              <input
                type="text"
                value={newRule.port}
                onChange={(e) => setNewRule({ ...newRule, port: e.target.value })}
                placeholder="e.g. 443"
                required
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
                className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
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

      {/* Stats + Filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Total Rules
          </p>
          <p className="text-5xl font-black mt-2 text-indigo-600 tracking-tighter">{rules.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Global / Network
          </p>
          <p className="text-5xl font-black mt-2 tracking-tighter">
            <span className="text-violet-600">{rules.filter((r) => r.network_id === null).length}</span>
            <span className="text-slate-300 dark:text-slate-700 mx-2">/</span>
            <span className="text-cyan-600">{rules.filter((r) => r.network_id !== null).length}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm">
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
      </div>

      {/* Rules table */}
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-50 dark:border-slate-800/50 bg-white dark:bg-slate-900">
                <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Scope
                </th>
                <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  IP
                </th>
                <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Port
                </th>
                <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Type
                </th>
                <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  Description
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30">
              {rulesQuery.isLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-sm text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-sm text-slate-400 italic">
                    No port rules found
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  const isGlobal = rule.network_id === null
                  return (
                    <tr
                      key={`${isGlobal ? 'g' : 'n'}-${rule.id}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                    >
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
                      <td className="px-6 py-3 font-mono text-sm text-slate-700 dark:text-slate-300">
                        {rule.ip || <span className="text-slate-300 dark:text-slate-600 italic">Any</span>}
                      </td>
                      <td className="px-6 py-3 font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {rule.port}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            rule.rule_type === 'accepted'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                          }`}
                        >
                          {rule.rule_type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {rule.description || '-'}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => handleDelete(rule)}
                            disabled={deleteMutation.isPending}
                            className="rounded-lg border border-rose-200 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-500/20 dark:border-rose-500/40 dark:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </button>
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
