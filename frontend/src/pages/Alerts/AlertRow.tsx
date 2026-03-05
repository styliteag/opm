import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseUtcDate, formatDateTime, formatRelativeTime } from '../../lib/formatters'
import type { Alert, User } from '../../types'
import { getAlertLabelCompact, getAlertStyleCompact } from '../../constants/alerts'
import type { Severity } from './useAlerts'

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

type Props = {
  alert: Alert
  isAdmin: boolean
  isExpanded: boolean
  isSelected: boolean
  isAccepted: boolean
  acceptedReason: string | null
  acceptedRuleInfo: { ruleId: number; scope: 'global' | 'network' } | null
  onToggle: () => void
  onSelect: (checked: boolean) => void
  onResolve: () => void
  onReopen: (alertId: number) => void
  onRevoke: (scope: 'global' | 'network', ruleId: number) => void
  isRevoking: boolean
  isReopening: boolean
  users: User[]
  onAssign: (alertId: number, userId: number | null) => void
  isAssigning: boolean
}

export default function AlertRow({
  alert,
  isAdmin,
  isExpanded,
  isSelected,
  isAccepted,
  acceptedReason,
  acceptedRuleInfo,
  onToggle,
  onSelect,
  onResolve,
  onReopen,
  onRevoke,
  isRevoking,
  isReopening,
  users,
  onAssign,
  isAssigning,
}: Props) {
  const now = new Date()
  const alertDate = parseUtcDate(alert.created_at)
  const severity = alert.severity as Severity
  const [assignOpen, setAssignOpen] = useState(false)

  useEffect(() => {
    if (!assignOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-dropdown]')) setAssignOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [assignOpen])

  return (
    <tr
      onClick={onToggle}
      className={`text-sm transition cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${alert.dismissed || isAccepted ? 'opacity-60' : ''}`}
    >
      {isAdmin && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
        </td>
      )}
      <td className="px-2 py-3">
        <div className="flex items-center gap-1">
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link
            to={`/alerts/${alert.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-slate-400 hover:text-indigo-500 transition-colors"
            title="Open alert detail"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </Link>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${severityStyles[severity]}`}
        >
          {severityLabels[severity]}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
              alert.source === 'ssh'
                ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
            }`}
          >
            {alert.source === 'ssh' ? 'SSH' : 'Port'}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${getAlertStyleCompact(alert.type)}`}
          >
            {getAlertLabelCompact(alert.type)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {alert.host_id ? (
          <Link
            to={`/hosts/${alert.host_id}`}
            className="font-mono text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {alert.ip}
          </Link>
        ) : (
          <p className="font-mono text-slate-600 dark:text-slate-300">{alert.ip}</p>
        )}
        {alert.hostname &&
          (alert.host_id ? (
            <Link
              to={`/hosts/${alert.host_id}`}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5 block"
            >
              {alert.hostname}
            </Link>
          ) : (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{alert.hostname}</p>
          ))}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="font-mono text-slate-600 dark:text-slate-300">
          {alert.port ?? <span className="text-slate-400 italic">—</span>}
        </span>
        {alert.ssh_summary && (
          <span className="ml-2 inline-flex gap-1">
            {alert.ssh_summary.password_enabled ||
            alert.ssh_summary.keyboard_interactive_enabled ? (
              <span
                title="SSH: password/keyboard auth enabled"
                className="inline-block rounded px-1 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
              >
                PASS
              </span>
            ) : (
              <span
                title="SSH: publickey only"
                className="inline-block rounded px-1 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              >
                KEY
              </span>
            )}
            {(alert.ssh_summary.has_weak_ciphers || alert.ssh_summary.has_weak_kex) && (
              <span
                title="SSH: weak ciphers/KEX"
                className="inline-block rounded px-1 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
              >
                WEAK
              </span>
            )}
            {alert.ssh_summary.ssh_version && (
              <span
                title={`SSH version: ${alert.ssh_summary.ssh_version}`}
                className="inline-block rounded px-1 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                {alert.ssh_summary.ssh_version.replace(/OpenSSH[_\s]?/i, '')}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-900 dark:text-white">
        {alert.network_name ?? <span className="text-slate-400">Global</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <p className="text-slate-700 dark:text-slate-200">{formatRelativeTime(alertDate, now)}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(alertDate)}</p>
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        {alert.last_comment ? (
          <div title={`${alert.last_comment_by}: ${alert.last_comment}`}>
            <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
              {alert.last_comment}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              {alert.last_comment_by}
              {alert.last_comment_at &&
                ` \u00b7 ${formatRelativeTime(parseUtcDate(alert.last_comment_at), now)}`}
            </p>
          </div>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500 italic">None</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative" data-dropdown>
          <button
            onClick={() => setAssignOpen(assignOpen ? false : true)}
            disabled={isAssigning}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white dark:border-slate-600/60 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {isAssigning ? (
              <span className="animate-pulse">Updating...</span>
            ) : alert.assigned_to_email ? (
              <span className="max-w-[120px] truncate">{alert.assigned_to_email}</span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Unassigned</span>
            )}
            <svg
              className="h-3 w-3 shrink-0 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {assignOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
              <button
                onClick={() => {
                  onAssign(alert.id, null)
                  setAssignOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-slate-700 ${!alert.assigned_to_user_id ? 'font-semibold text-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {!alert.assigned_to_user_id && <span className="text-cyan-500">&#10003;</span>}
                Unassigned
              </button>
              <div className="mx-2 my-0.5 border-t border-slate-100 dark:border-slate-700" />
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onAssign(alert.id, u.id)
                    setAssignOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-slate-700 ${alert.assigned_to_user_id === u.id ? 'font-semibold text-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  {alert.assigned_to_user_id === u.id && (
                    <span className="text-cyan-500">&#10003;</span>
                  )}
                  {u.email}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          {alert.dismissed || isAccepted ? (
            <>
              {isAccepted ? (
                <span
                  className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200 cursor-default"
                  title={alert.dismiss_reason || acceptedReason || undefined}
                >
                  Accepted
                </span>
              ) : (
                <span
                  className="inline-flex items-center rounded-full border border-sky-300/50 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-200 cursor-default"
                  title={alert.dismiss_reason || undefined}
                >
                  Dismissed
                </span>
              )}
              {isAdmin && acceptedRuleInfo && (
                <button
                  onClick={() => onRevoke(acceptedRuleInfo.scope, acceptedRuleInfo.ruleId)}
                  disabled={isRevoking}
                  className="rounded-full border border-slate-200 bg-slate-100/50 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:text-rose-400 disabled:opacity-50"
                  title="Revoke acceptance rule"
                >
                  Revoke Rule
                </button>
              )}
              {isAdmin && alert.dismissed && !acceptedRuleInfo && (
                <button
                  onClick={() => onReopen(alert.id)}
                  disabled={isReopening}
                  className="rounded-full border border-slate-200 bg-slate-100/50 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:text-rose-400 disabled:opacity-50"
                  title="Reopen this alert"
                >
                  Reopen
                </button>
              )}
            </>
          ) : isAdmin ? (
            <button
              onClick={onResolve}
              className="rounded-full border border-emerald-300 bg-emerald-500/10 px-4 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300"
            >
              Accept
            </button>
          ) : (
            <span className="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
              Pending
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
