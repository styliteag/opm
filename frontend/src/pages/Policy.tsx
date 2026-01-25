import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchJson, API_BASE_URL, getAuthHeaders } from '../lib/api'
import type { PolicyRule, PolicyListResponse, NetworkListResponse } from '../types'
import React from 'react'

const Policy = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const [filterNetworkId, setFilterNetworkId] = useState<string>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newRule, setNewRule] = useState({
    network_id: 'all', // 'all' means Global
    ip: '',
    port: '',
    rule_type: 'allow' as 'allow' | 'block',
    description: '',
  })

  // Editing state
  const [editingRule, setEditingRule] = useState<PolicyRule | null>(null)
  const [editFields, setEditFields] = useState({
    ip: '',
    port: '',
    rule_type: 'allow' as 'allow' | 'block',
    description: '',
  })

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const policyQuery = useQuery({
    queryKey: ['policy', filterNetworkId],
    queryFn: () => {
      const url =
        filterNetworkId === 'all' ? '/api/policy' : `/api/policy?network_id=${filterNetworkId}`
      return fetchJson<PolicyListResponse>(url, token ?? '')
    },
    enabled: Boolean(token),
  })

  const createMutation = useMutation({
    mutationFn: async (payload: {
      network_id: number | null
      ip: string | null
      port: string
      rule_type: 'allow' | 'block'
      description: string | null
    }) => {
      const response = await fetch(`${API_BASE_URL}/api/policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to create policy rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy'] })
      setShowAddForm(false)
      setNewRule({ network_id: 'all', ip: '', port: '', rule_type: 'allow', description: '' })
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      rule: PolicyRule
      ip: string | null
      port: string
      rule_type: 'allow' | 'block'
      description: string
    }) => {
      const scope = payload.rule.network_id === null ? 'global' : 'network'
      const response = await fetch(`${API_BASE_URL}/api/policy/${scope}/${payload.rule.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify({
          ip: payload.ip,
          port: payload.port,
          rule_type: payload.rule_type,
          description: payload.description,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to update policy rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy'] })
      setEditingRule(null)
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (rule: PolicyRule) => {
      const scope = rule.network_id === null ? 'global' : 'network'
      const response = await fetch(`${API_BASE_URL}/api/policy/${scope}/${rule.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to delete policy rule')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy'] })
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const port = newRule.port.trim() || '*'
    createMutation.mutate({
      network_id: newRule.network_id === 'all' ? null : Number(newRule.network_id),
      ip: newRule.ip.trim() || null,
      port,
      rule_type: newRule.rule_type,
      description: newRule.description.trim() || null,
    })
  }

  const handleStartEdit = (rule: PolicyRule) => {
    setEditingRule(rule)
    setEditFields({
      ip: rule.ip || '',
      port: rule.port === '*' ? '' : rule.port,
      rule_type: rule.rule_type,
      description: rule.description || '',
    })
  }

  const handleSaveEdit = () => {
    if (!editingRule) return
    updateMutation.mutate({
      rule: editingRule,
      ip: editFields.ip.trim() || null,
      port: editFields.port.trim() || '*',
      rule_type: editFields.rule_type,
      description: editFields.description.trim(),
    })
  }

  const rules = policyQuery.data?.rules ?? []
  const networks = networksQuery.data?.networks ?? []

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto p-4 md:p-8">
      <div className="rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[80px] -mr-32 -mt-32 transition-colors group-hover:bg-cyan-500/10" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
              Security Policy
            </h1>
            <p className="text-slate-500 mt-3 uppercase text-[11px] font-black tracking-[0.3em] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              Unified Rule Governance
            </p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={filterNetworkId}
              onChange={(e) => setFilterNetworkId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-2 text-xs font-bold focus:border-cyan-500 outline-none transition-all shadow-sm"
            >
              <option value="all">Display All Scopes</option>
              {networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl ${
                  showAddForm
                    ? 'bg-white dark:bg-slate-800 text-slate-600 border-2 border-slate-100 dark:border-slate-700'
                    : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                }`}
              >
                {showAddForm ? 'Cancel' : 'Add Rule'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-8 p-6 bg-rose-50 dark:bg-rose-900/20 rounded-[1.5rem] text-[11px] font-black text-rose-600 dark:text-rose-400 border-2 border-rose-100 dark:border-rose-900/50 uppercase tracking-[0.2em] flex items-center gap-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {error}
          </div>
        )}

        {showAddForm && isAdmin && (
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6 animate-in slide-in-from-top-4 duration-500"
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Scope
                </label>
                <select
                  value={newRule.network_id}
                  onChange={(e) => setNewRule({ ...newRule, network_id: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-cyan-500 outline-none transition-all shadow-inner"
                >
                  <option value="all">Global (All Networks)</option>
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  IP Address
                </label>
                <input
                  type="text"
                  value={newRule.ip}
                  onChange={(e) => setNewRule({ ...newRule, ip: e.target.value })}
                  placeholder="Optional (All IPs)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-cyan-500 outline-none transition-all shadow-inner"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Port / Range
                </label>
                <input
                  type="text"
                  value={newRule.port}
                  onChange={(e) => setNewRule({ ...newRule, port: e.target.value })}
                  placeholder="e.g. 22, 80-443"
                  className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-cyan-500 outline-none transition-all shadow-inner"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Classification
                </label>
                <select
                  value={newRule.rule_type}
                  onChange={(e) =>
                    setNewRule({ ...newRule, rule_type: e.target.value as 'allow' | 'block' })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-cyan-500 outline-none transition-all shadow-inner"
                >
                  <option value="allow">Whitelist (Allow)</option>
                  <option value="block">Blacklist (Block)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="Justification"
                  className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-cyan-500 outline-none transition-all shadow-inner"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-10 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all"
              >
                {createMutation.isPending ? 'Committing...' : 'Commit Rule'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden min-h-[400px]">
        <header className="px-10 py-6 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          <div className="flex-1">Source / Scope</div>
          <div className="flex-[1.5]">Target Identifier (IP:Port)</div>
          <div className="flex-1 text-center">Type</div>
          <div className="flex-[2]">Justification</div>
          <div className="w-48 text-right">Actions</div>
        </header>

        <div className="divide-y divide-slate-50 dark:divide-slate-800/30">
          {policyQuery.isLoading ? (
            <div className="p-20 text-center text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
              Syncing Cryptographic Security Layer...
            </div>
          ) : rules.length === 0 ? (
            <div className="p-20 text-center">
              <p className="text-sm font-bold text-slate-400 italic">
                No rules found for this scope.
              </p>
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={`${rule.network_id}-${rule.id}`}
                className={`px-10 py-4 transition-all ${editingRule?.id === rule.id && editingRule.network_id === rule.network_id ? 'bg-cyan-50 dark:bg-cyan-900/10' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/10'}`}
              >
                <div className="flex items-center gap-4">
                  {/* Scope */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                        rule.network_id === null
                          ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600'
                          : 'bg-slate-500/10 border-slate-500/20 text-slate-600'
                      }`}
                    >
                      {rule.network_name || 'Global'}
                    </span>
                  </div>

                  {/* Address */}
                  <div className="flex-[1.5] min-w-0 font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {editingRule?.id === rule.id && editingRule.network_id === rule.network_id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editFields.ip}
                          onChange={(e) => setEditFields({ ...editFields, ip: e.target.value })}
                          placeholder="ALL"
                          className="w-24 bg-white dark:bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-xs"
                        />
                        <span>:</span>
                        <input
                          type="text"
                          value={editFields.port}
                          onChange={(e) => setEditFields({ ...editFields, port: e.target.value })}
                          placeholder="*"
                          className="w-16 bg-white dark:bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    ) : (
                      <>
                        <span className={rule.ip ? '' : 'text-slate-400'}>{rule.ip || 'Any'}</span>
                        <span className="mx-1 text-slate-300">:</span>
                        <span className="text-cyan-600 dark:text-cyan-400">
                          {rule.port === '*' ? 'EVERY PORT' : rule.port}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Type */}
                  <div className="flex-1 text-center">
                    {editingRule?.id === rule.id && editingRule.network_id === rule.network_id ? (
                      <select
                        value={editFields.rule_type}
                        onChange={(e) =>
                          setEditFields({
                            ...editFields,
                            rule_type: e.target.value as 'allow' | 'block',
                          })
                        }
                        className="bg-white dark:bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-xs font-bold"
                      >
                        <option value="allow">ALLOW</option>
                        <option value="block">BLOCK</option>
                      </select>
                    ) : (
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter border ${
                          rule.rule_type === 'allow'
                            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'
                            : 'bg-rose-500/5 border-rose-500/20 text-rose-600'
                        }`}
                      >
                        {rule.rule_type}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <div className="flex-[2] min-w-0">
                    {editingRule?.id === rule.id && editingRule.network_id === rule.network_id ? (
                      <input
                        type="text"
                        value={editFields.description}
                        onChange={(e) =>
                          setEditFields({ ...editFields, description: e.target.value })
                        }
                        className="w-full bg-white dark:bg-slate-950 border border-cyan-500 rounded px-3 py-1 text-sm font-medium"
                      />
                    ) : (
                      <p
                        className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate hover:whitespace-normal cursor-help"
                        title={rule.description || ''}
                      >
                        {rule.description || '—'}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="w-48 flex items-center justify-end gap-2">
                    {editingRule?.id === rule.id && editingRule.network_id === rule.network_id ? (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          className="text-[10px] font-black uppercase text-cyan-600 hover:underline"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRule(null)}
                          className="text-[10px] font-black uppercase text-slate-400 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      isAdmin && (
                        <>
                          <button
                            onClick={() => handleStartEdit(rule)}
                            className="p-2 text-slate-400 hover:text-cyan-500 transition-colors"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(rule)}
                            disabled={deleteMutation.isPending}
                            className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Policy
