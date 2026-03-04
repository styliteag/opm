import { useState } from 'react'
import AlertComments from '../../components/AlertComments'
import InlineRuleEditor from '../../components/InlineRuleEditor'
import { parseUtcDate, formatDateTime } from '../../lib/formatters'
import type { Alert, GlobalOpenPort, HostNetworkInfo } from '../../types'
import { getServiceName } from './useAlerts'

type Props = {
  alert: Alert
  portData: GlobalOpenPort | null
  isAdmin: boolean
  colSpan: number
  networks: HostNetworkInfo[]
  onRescan: (ip: string) => void
  isRescanPending: boolean
  onEditComment: (hostId: number, comment: string, ip: string) => void
  onCreateRule?: (payload: {
    network_id?: number | null
    ip?: string | null
    port: string
    rule_type: 'accepted' | 'critical'
    description?: string | null
  }) => void
  isCreatingRule?: boolean
  onToast: (message: string, tone: 'success' | 'error') => void
}

export default function AlertExpandedRow({
  alert,
  portData,
  isAdmin,
  colSpan,
  networks,
  onRescan,
  isRescanPending,
  onEditComment,
  onCreateRule,
  isCreatingRule,
  onToast,
}: Props) {
  const [showRuleEditor, setShowRuleEditor] = useState(false)
  return (
    <tr className="bg-slate-50/20 dark:bg-slate-800/10">
      <td colSpan={colSpan} className="px-16 py-12">
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Service / Port detail */}
            <div className="space-y-8">
              {portData ? (
                <>
                  <div>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.25em] mb-2">
                      Service Detection
                    </p>
                    <p className="text-lg font-black text-slate-900 dark:text-white">
                      {getServiceName(portData.service_guess, portData.banner)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Protocol: {portData.protocol.toUpperCase()}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                        First Seen
                      </p>
                      <p className="text-xs font-black text-slate-700 dark:text-slate-300">
                        {formatDateTime(parseUtcDate(portData.first_seen_at))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                        Last Seen
                      </p>
                      <p className="text-xs font-black text-slate-700 dark:text-slate-300">
                        {formatDateTime(parseUtcDate(portData.last_seen_at))}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-slate-500 dark:text-slate-400">No port data available</p>
                </div>
              )}
            </div>

            {/* Host comment + matching rules */}
            <div className="border-l border-slate-100 dark:border-slate-800/50 pl-12">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
                  Host Comment
                </p>
                {isAdmin && alert.host_id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditComment(alert.host_id!, alert.user_comment || '', alert.ip)
                    }}
                    className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                {alert.user_comment || 'No comment'}
              </p>
              {alert.hostname && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">
                    Hostname
                  </p>
                  <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {alert.hostname}
                  </p>
                </div>
              )}
              {/* Matching port rules */}
              {alert.matching_rules.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">
                    Matching Rules
                  </p>
                  <div className="space-y-1">
                    {alert.matching_rules.map((rule) => (
                      <div
                        key={`${rule.scope}-${rule.id}`}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="text-slate-400 w-14">
                          {rule.scope === 'global' ? 'Global' : (rule.network_name ?? 'Network')}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            rule.rule_type === 'accepted'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                          }`}
                        >
                          {rule.rule_type}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 truncate">
                          {rule.description || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Banner + SSH detail */}
            <div className="border-l border-slate-100 dark:border-slate-800/50 pl-12 space-y-6">
              {portData?.banner && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">
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
              {/* SSH Security detail */}
              {alert.ssh_summary && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3">
                    SSH Security
                  </p>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          alert.ssh_summary.publickey_enabled
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        PubKey: {alert.ssh_summary.publickey_enabled ? 'On' : 'Off'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          alert.ssh_summary.password_enabled
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}
                      >
                        Password: {alert.ssh_summary.password_enabled ? 'On' : 'Off'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          alert.ssh_summary.keyboard_interactive_enabled
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}
                      >
                        KbdInt: {alert.ssh_summary.keyboard_interactive_enabled ? 'On' : 'Off'}
                      </span>
                      {alert.ssh_summary.has_weak_ciphers && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          Weak Ciphers
                        </span>
                      )}
                      {alert.ssh_summary.has_weak_kex && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          Weak KEX
                        </span>
                      )}
                    </div>
                    {alert.ssh_summary.ssh_version && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {alert.ssh_summary.ssh_version}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Scanned: {formatDateTime(parseUtcDate(alert.ssh_summary.last_scanned))}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Inline Rule Editor */}
          {isAdmin && showRuleEditor && onCreateRule && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/50">
              <InlineRuleEditor
                ip={alert.ip}
                port={alert.port}
                networks={networks}
                onSave={(payload) => {
                  onCreateRule(payload)
                  setShowRuleEditor(false)
                }}
                onCancel={() => setShowRuleEditor(false)}
                isSaving={isCreatingRule}
              />
            </div>
          )}

          {/* Rescan + Comments */}
          <div className="pt-8 border-t border-slate-100 dark:border-slate-800/50">
            {isAdmin && (
              <div className="mb-6 flex items-center gap-3">
                <button
                  onClick={() => onRescan(alert.ip)}
                  disabled={isRescanPending}
                  className="rounded-full border border-cyan-300 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold text-cyan-700 transition hover:border-cyan-400 hover:bg-cyan-500/20 dark:border-cyan-500/40 dark:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Rescan this host with nmap"
                >
                  {isRescanPending ? 'Scanning...' : 'Rescan Host'}
                </button>
                {onCreateRule && !showRuleEditor && (
                  <button
                    onClick={() => setShowRuleEditor(true)}
                    className="rounded-full border border-indigo-300 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-200"
                  >
                    Create Rule
                  </button>
                )}
              </div>
            )}
            <AlertComments alertId={alert.id} onToast={onToast} />
          </div>
        </div>
      </td>
    </tr>
  )
}
