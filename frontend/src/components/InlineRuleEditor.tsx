import { useState } from 'react'
import type { HostNetworkInfo } from '../types'

type Props = {
  ip?: string | null
  port?: number | null
  networks?: HostNetworkInfo[]
  onSave: (payload: {
    network_id?: number | null
    ip?: string | null
    port: string
    rule_type: 'accepted' | 'critical'
    description?: string | null
  }) => void
  onCancel: () => void
  isSaving?: boolean
}

export default function InlineRuleEditor({
  ip, port, networks, onSave, onCancel, isSaving = false,
}: Props) {
  const [scope, setScope] = useState<'global' | number>('global')
  const [ruleType, setRuleType] = useState<'accepted' | 'critical'>('accepted')
  const [portValue, setPortValue] = useState(port != null ? String(port) : '')
  const [ipValue, setIpValue] = useState(ip ?? '')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!portValue.trim()) return
    onSave({
      network_id: scope === 'global' ? null : scope,
      ip: ipValue.trim() || null,
      port: portValue.trim(),
      rule_type: ruleType,
      description: description.trim() || null,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3 dark:border-indigo-500/30 dark:bg-indigo-500/5"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Create Port Rule
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Scope */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            Scope
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value === 'global' ? 'global' : Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="global">Global</option>
            {(networks ?? []).map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        {/* Port */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            Port
          </label>
          <input
            type="text"
            value={portValue}
            onChange={(e) => setPortValue(e.target.value)}
            placeholder="80 or 80-443"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-mono text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* IP (optional) */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            IP (optional)
          </label>
          <input
            type="text"
            value={ipValue}
            onChange={(e) => setIpValue(e.target.value)}
            placeholder="Any IP"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-mono text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* Rule Type */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            Type
          </label>
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as 'accepted' | 'critical')}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="accepted">Accepted</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Known web server"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSaving || !portValue.trim()}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isSaving ? 'Saving...' : 'Save Rule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
