import { useState } from 'react'
import InlineRuleEditor from '../../../components/InlineRuleEditor'
import type { EnrichedHostPort, HostNetworkInfo, HostSSHSummary } from '../../../types'
import { parseUtcDate, formatDateTime } from '../../../lib/formatters'

type Props = {
  ports: EnrichedHostPort[]
  isAdmin: boolean
  networks?: HostNetworkInfo[]
  onAcknowledge?: (alertId: number) => void
  onCreateRule?: (payload: {
    network_id?: number | null
    ip?: string | null
    port: string
    rule_type: 'accepted' | 'critical'
    description?: string | null
  }) => void
  isCreatingRule?: boolean
}

function RuleBadge({ status }: { status: string | null }) {
  if (status === 'accepted')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
        Accepted
      </span>
    )
  if (status === 'critical')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">
        Critical
      </span>
    )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      No Rule
    </span>
  )
}

function AlertBadge({ status, severity }: { status: string | null; severity: string | null }) {
  if (status === 'new') {
    const colors =
      severity === 'critical'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
        : severity === 'high'
          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200'
          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200'
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors}`}
      >
        Alert
      </span>
    )
  }
  if (status === 'acknowledged')
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
        Acked
      </span>
    )
  return null
}

function SSHBadge({ ssh }: { ssh: HostSSHSummary }) {
  const isInsecure = ssh.password_enabled || ssh.keyboard_interactive_enabled
  const hasWeakCrypto = ssh.has_weak_ciphers || ssh.has_weak_kex
  const issues = isInsecure || hasWeakCrypto

  return (
    <div className="flex items-center gap-1">
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          issues
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
        }`}
        title={`SSH ${ssh.ssh_version ?? ''} | Auth: ${ssh.publickey_enabled ? 'key' : ''}${ssh.password_enabled ? ' pass' : ''}${ssh.keyboard_interactive_enabled ? ' kbd' : ''} | ${hasWeakCrypto ? 'Weak crypto' : 'Secure crypto'}`}
      >
        SSH {isInsecure ? 'PASS' : 'KEY'}
        {hasWeakCrypto && ' WEAK'}
      </span>
    </div>
  )
}

function ExpandedSSHDetail({ ssh }: { ssh: HostSSHSummary }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">SSH Security</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Version</dt>
          <dd className="font-mono text-slate-900 dark:text-white">
            {ssh.ssh_version ?? 'Unknown'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Last Scanned</dt>
          <dd className="text-slate-900 dark:text-white">
            {formatDateTime(parseUtcDate(ssh.last_scanned))}
          </dd>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ssh.publickey_enabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          Public Key: {ssh.publickey_enabled ? 'Enabled' : 'Disabled'}
        </span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ssh.password_enabled
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}
        >
          Password: {ssh.password_enabled ? 'Enabled' : 'Disabled'}
        </span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            ssh.keyboard_interactive_enabled
              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}
        >
          Keyboard Interactive: {ssh.keyboard_interactive_enabled ? 'Enabled' : 'Disabled'}
        </span>
        {ssh.has_weak_ciphers && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            Weak Ciphers
          </span>
        )}
        {ssh.has_weak_kex && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            Weak Key Exchange
          </span>
        )}
      </div>
    </div>
  )
}

export default function EnrichedPortTable({
  ports,
  isAdmin,
  networks,
  onAcknowledge,
  onCreateRule,
  isCreatingRule,
}: Props) {
  const [expandedPort, setExpandedPort] = useState<number | null>(null)
  const [creatingRuleForPort, setCreatingRuleForPort] = useState<number | null>(null)

  if (ports.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Open Ports</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">No open ports detected.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Open Ports ({ports.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                Port
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                Service
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                Rule
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                Alert
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                SSH
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                Comment
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                Last Seen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {ports.map((port) => {
              const isExpanded = expandedPort === port.port
              return (
                <tr key={`${port.port}-${port.protocol}`} className="group">
                  <td colSpan={7} className="p-0">
                    {/* Main row */}
                    <div
                      className="flex items-center cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors px-4 py-2"
                      onClick={() => setExpandedPort(isExpanded ? null : port.port)}
                    >
                      <div className="flex-shrink-0 w-20">
                        <span className="text-sm font-mono text-slate-900 dark:text-white">
                          {port.port}
                        </span>
                        <span className="ml-1 text-[10px] text-slate-400 uppercase">
                          {port.protocol}
                        </span>
                      </div>
                      <div className="flex-shrink-0 w-32 text-sm text-slate-900 dark:text-white truncate">
                        {port.service_guess || <span className="text-slate-400">-</span>}
                      </div>
                      <div className="flex-shrink-0 w-24">
                        <RuleBadge status={port.rule_status} />
                      </div>
                      <div className="flex-shrink-0 w-20">
                        <AlertBadge status={port.alert_status} severity={port.alert_severity} />
                      </div>
                      <div className="flex-shrink-0 w-28">
                        {port.ssh_summary ? (
                          <SSHBadge ssh={port.ssh_summary} />
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </div>
                      <div
                        className="flex-1 text-sm text-slate-500 dark:text-slate-400 truncate max-w-[200px]"
                        title={port.user_comment ?? port.ack_reason ?? undefined}
                      >
                        {port.user_comment || port.ack_reason || (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                      <div className="flex-shrink-0 w-36 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap text-right">
                        {formatDateTime(parseUtcDate(port.last_seen_at))}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800/50 space-y-4">
                        {/* Banner */}
                        {port.banner && (
                          <div>
                            <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Banner
                            </h4>
                            <pre className="text-xs font-mono bg-slate-900 text-green-400 dark:bg-black p-3 rounded-lg overflow-x-auto">
                              {port.banner}
                            </pre>
                          </div>
                        )}

                        {/* SSH detail */}
                        {port.ssh_summary && <ExpandedSSHDetail ssh={port.ssh_summary} />}

                        {/* Matching rules */}
                        {port.matching_rules.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                              Matching Rules
                            </h4>
                            <div className="space-y-1">
                              {port.matching_rules.map((rule) => (
                                <div
                                  key={`${rule.scope}-${rule.id}`}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <span className="text-xs text-slate-400 w-16">
                                    {rule.scope === 'global' ? 'Global' : rule.network_name}
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
                                  <span className="text-slate-600 dark:text-slate-300 text-xs truncate">
                                    {rule.description || '-'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ACK reason */}
                        {port.ack_reason && (
                          <div>
                            <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Acknowledgment Reason
                            </h4>
                            <p className="text-sm text-slate-700 dark:text-slate-300 italic">
                              {port.ack_reason}
                            </p>
                          </div>
                        )}

                        {/* Inline Rule Editor */}
                        {creatingRuleForPort === port.port && onCreateRule && (
                          <InlineRuleEditor
                            ip={port.ip}
                            port={port.port}
                            networks={networks}
                            onSave={(payload) => {
                              onCreateRule(payload)
                              setCreatingRuleForPort(null)
                            }}
                            onCancel={() => setCreatingRuleForPort(null)}
                            isSaving={isCreatingRule}
                          />
                        )}

                        {/* Actions */}
                        {isAdmin && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
                            {port.alert_status === 'new' && port.alert_id && onAcknowledge && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onAcknowledge(port.alert_id!)
                                }}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                              >
                                Acknowledge Alert
                              </button>
                            )}
                            {onCreateRule && creatingRuleForPort !== port.port && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCreatingRuleForPort(port.port)
                                }}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                              >
                                Create Rule
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
