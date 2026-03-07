import { useState } from 'react'
import ReasonSuggestions from './ReasonSuggestions'

type ReviewAlert = {
  id: number
  ip: string
  port: number | null
  network_id: number | null
  network_name: string | null
  related_ssh_alert_count: number
  related_ssh_alerts_dismissed: boolean
}

type Props = {
  alerts: ReviewAlert[]
  mode: 'single' | 'bulk'
  alertCategory?: 'port' | 'ssh'
  onDismiss: (reason: string, includeSSH: boolean) => void
  onAcceptGlobal: (reason: string, includeSSH: boolean) => void
  onAcceptNetwork?: (reason: string, includeSSH: boolean) => void
  onClose: () => void
  isProcessing?: boolean
  requireReasonForRules?: boolean
}

export default function ReviewModal({
  alerts,
  mode,
  alertCategory = 'port',
  onDismiss,
  onAcceptGlobal,
  onAcceptNetwork,
  onClose,
  isProcessing = false,
  requireReasonForRules = true,
}: Props) {
  const [reason, setReason] = useState('')
  const [includeSSH, setIncludeSSH] = useState(true)

  const first = alerts[0]
  const isSSH = alertCategory === 'ssh'
  const hasSSH =
    !isSSH &&
    mode === 'single' &&
    first.related_ssh_alert_count > 0 &&
    !first.related_ssh_alerts_dismissed

  const reasonTrimmed = reason.trim()
  const canCreateRule = !requireReasonForRules || reasonTrimmed.length > 0

  const title = isSSH
    ? mode === 'bulk'
      ? `Review ${alerts.length} SSH Alerts`
      : 'Review SSH Alert'
    : mode === 'bulk'
      ? `Review ${alerts.length} Alerts`
      : 'Review Alert'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200/70 bg-white p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-900">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
            {mode === 'single' && (
              <p className="mt-2 font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {first.ip}
                {first.port != null ? `:${first.port}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          {isSSH ? (
            <>
              You can <strong>dismiss</strong> to mark as reviewed, or{' '}
              <strong>accept</strong> to suppress this SSH finding globally.
            </>
          ) : (
            <>
              You can <strong>dismiss</strong> to mark as reviewed, or{' '}
              <strong>accept</strong> to create a rule so future scans won't alert again.
            </>
          )}
        </p>

        {/* Reason input */}
        <div className="mb-6 space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Reason
          </label>
          <ReasonSuggestions
            port={mode === 'single' ? first.port : null}
            value={reason}
            onChange={setReason}
            placeholder={
              isSSH
                ? 'e.g. Legacy device, compensating controls in place...'
                : 'e.g. Known web server, authorized management interface...'
            }
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>

        {/* SSH checkbox — only for port alerts */}
        {hasSSH && (
          <label className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 cursor-pointer transition hover:bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5 dark:hover:bg-amber-500/10">
            <input
              type="checkbox"
              checked={includeSSH}
              onChange={(e) => setIncludeSSH(e.target.checked)}
              className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 dark:border-amber-600"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-200">
                Also dismiss {first.related_ssh_alert_count} SSH security{' '}
                {first.related_ssh_alert_count === 1 ? 'finding' : 'findings'}
              </p>
              <p className="text-xs text-amber-600/80 dark:text-amber-300/60">
                Marks related SSH alerts (weak ciphers, auth issues, etc.) as dismissed
              </p>
            </div>
          </label>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Dismiss */}
          <button
            onClick={() => onDismiss(reasonTrimmed, includeSSH)}
            disabled={isProcessing}
            className="group flex w-full items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/5 dark:hover:bg-indigo-500/10"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-indigo-700 dark:text-indigo-200">Dismiss</p>
              <p className="text-xs text-indigo-600/80 dark:text-indigo-300/70">
                {isSSH
                  ? 'Mark as reviewed — future scans will still report this finding'
                  : 'Mark as reviewed — no acceptance rule, future scans will still alert'}
              </p>
            </div>
          </button>

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100 dark:border-slate-800"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 dark:bg-slate-900 dark:text-slate-600">
                or create an acceptance rule
              </span>
            </div>
          </div>

          {/* Accept globally */}
          <div className="group rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 transition-all hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-emerald-700 dark:text-emerald-200">
                  Accept globally
                </p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-300/70">
                  {isSSH
                    ? 'Suppress this SSH finding for this port on all networks'
                    : "Create a global rule — this port won't trigger alerts on any network"}
                </p>
              </div>
            </div>
            <button
              onClick={() => onAcceptGlobal(reasonTrimmed, includeSSH)}
              disabled={!canCreateRule || isProcessing}
              className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-emerald-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
            >
              {isProcessing ? 'Processing...' : 'Accept globally'}
            </button>
          </div>

          {/* Accept in network — port alerts only */}
          {!isSSH && onAcceptNetwork && (
            <div className="group rounded-xl border border-blue-200 bg-blue-50/50 p-4 transition-all hover:bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/5 dark:hover:bg-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-blue-700 dark:text-blue-200">
                    {mode === 'single' && first.network_name
                      ? `Accept in ${first.network_name}`
                      : 'Accept in network'}
                  </p>
                  <p className="text-xs text-blue-600/80 dark:text-blue-300/70">
                    {mode === 'single' && first.network_name
                      ? `Create a rule scoped to ${first.network_name} only`
                      : "Create acceptance rules scoped to each alert's network"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onAcceptNetwork(reasonTrimmed, includeSSH)}
                disabled={!canCreateRule || isProcessing}
                className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
              >
                {isProcessing
                  ? 'Processing...'
                  : mode === 'single' && first.network_name
                    ? `Accept in ${first.network_name}`
                    : 'Accept in network'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
