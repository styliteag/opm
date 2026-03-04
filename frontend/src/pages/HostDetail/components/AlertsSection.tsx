import { useState } from 'react'
import AckSuggestions from '../../../components/AckSuggestions'
import type { HostAlertSummary } from '../../../types'

const parseUtcDate = (dateStr: string) => new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

const formatRelativeTime = (date: Date) => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
}

const alertTypeLabels: Record<string, string> = {
  new_port: 'New Port',
  not_allowed: 'Not Allowed',
  blocked: 'Blocked',
  ssh_insecure_auth: 'SSH Insecure Auth',
  ssh_weak_cipher: 'SSH Weak Cipher',
  ssh_weak_kex: 'SSH Weak KEX',
  ssh_outdated_version: 'SSH Outdated',
  ssh_config_regression: 'SSH Regression',
}

const PORT_ALERT_TYPES = new Set(['new_port', 'not_allowed', 'blocked'])

type Props = {
  alerts: HostAlertSummary[]
  acknowledgedAlerts: HostAlertSummary[]
  acknowledgedCount: number
  onAcknowledge: (alertId: number, reason?: string, includeSSH?: boolean) => void
  onUnacknowledge: (alertId: number) => void
  isAcknowledging: boolean
  isUnacknowledging: boolean
}

export default function AlertsSection({
  alerts,
  acknowledgedAlerts,
  acknowledgedCount,
  onAcknowledge,
  onUnacknowledge,
  isAcknowledging,
  isUnacknowledging,
}: Props) {
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [ackingAlertId, setAckingAlertId] = useState<number | null>(null)
  const [ackReason, setAckReason] = useState('')
  const [includeSSH, setIncludeSSH] = useState(true)
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null)
  const [editReason, setEditReason] = useState('')
  const activeAlerts = alerts.filter((a) => !a.acknowledged)

  const handleAckSubmit = (alert: HostAlertSummary) => {
    const hasSSH = PORT_ALERT_TYPES.has(alert.type) && alert.related_ssh_alert_count > 0
    onAcknowledge(alert.id, ackReason.trim() || undefined, hasSSH && includeSSH)
    setAckingAlertId(null)
    setAckReason('')
    setIncludeSSH(true)
  }

  const handleAckCancel = () => {
    setAckingAlertId(null)
    setAckReason('')
    setIncludeSSH(true)
  }

  const handleEditStart = (alert: HostAlertSummary) => {
    setEditingAlertId(alert.id)
    setEditReason(alert.ack_reason ?? '')
  }

  const handleEditSubmit = (alertId: number) => {
    onAcknowledge(alertId, editReason.trim() || undefined)
    setEditingAlertId(null)
    setEditReason('')
  }

  const handleEditCancel = () => {
    setEditingAlertId(null)
    setEditReason('')
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Alerts
          {activeAlerts.length > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              {activeAlerts.length} active
            </span>
          )}
        </h3>
        {acknowledgedCount > 0 && (
          <button
            onClick={() => setShowAcknowledged(!showAcknowledged)}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {showAcknowledged ? 'Hide' : 'Show'} acknowledged ({acknowledgedCount})
          </button>
        )}
      </div>

      {activeAlerts.length === 0 && acknowledgedCount === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">No alerts for this host.</p>
      )}

      {activeAlerts.length === 0 && acknowledgedCount > 0 && !showAcknowledged && (
        <p className="text-green-600 dark:text-green-400 text-sm">All alerts acknowledged.</p>
      )}

      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alert) => (
            <div key={alert.id}>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityColors[alert.severity] ?? severityColors.medium}`}
                  >
                    {alert.severity}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {alertTypeLabels[alert.type] ?? alert.type}
                  </span>
                  <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                    :{alert.port}
                  </span>
                  {PORT_ALERT_TYPES.has(alert.type) && alert.related_ssh_alert_count > 0 && (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        alert.related_ssh_alerts_acknowledged
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                      }`}
                      title={
                        alert.related_ssh_alerts_acknowledged
                          ? `${alert.related_ssh_alert_count} SSH finding(s) acknowledged`
                          : `${alert.related_ssh_alert_count} SSH finding(s) pending`
                      }
                    >
                      SSH {alert.related_ssh_alert_count}
                    </span>
                  )}
                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                    {alert.message}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span
                    className="text-xs text-slate-400"
                    title={parseUtcDate(alert.created_at).toLocaleString()}
                  >
                    {formatRelativeTime(parseUtcDate(alert.created_at))}
                  </span>
                  <button
                    onClick={() => setAckingAlertId(ackingAlertId === alert.id ? null : alert.id)}
                    disabled={isAcknowledging}
                    className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    title="Acknowledge"
                  >
                    Ack
                  </button>
                </div>
              </div>
              {ackingAlertId === alert.id && (
                <div className="mt-1 ml-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <AckSuggestions
                      port={alert.port}
                      value={ackReason}
                      onChange={setAckReason}
                      onEnter={() => handleAckSubmit(alert)}
                      onEscape={handleAckCancel}
                      placeholder="Reason (optional)"
                      autoFocus
                      className="flex-1 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <button
                      onClick={() => handleAckSubmit(alert)}
                      disabled={isAcknowledging}
                      className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Submit
                    </button>
                    <button
                      onClick={handleAckCancel}
                      className="px-2 py-1 text-xs font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                  {PORT_ALERT_TYPES.has(alert.type) &&
                    alert.related_ssh_alert_count > 0 &&
                    !alert.related_ssh_alerts_acknowledged && (
                      <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeSSH}
                          onChange={(e) => setIncludeSSH(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        Also acknowledge {alert.related_ssh_alert_count} SSH{' '}
                        {alert.related_ssh_alert_count === 1 ? 'finding' : 'findings'}
                      </label>
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAcknowledged && acknowledgedAlerts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
            Acknowledged
          </h4>
          <div className="space-y-2">
            {acknowledgedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityColors.info}`}
                    >
                      acked
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {alertTypeLabels[alert.type] ?? alert.type}
                    </span>
                    <span className="text-sm font-mono text-slate-400">:{alert.port}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 truncate">
                      {alert.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span
                      className="text-xs text-slate-400"
                      title={parseUtcDate(alert.created_at).toLocaleString()}
                    >
                      {formatRelativeTime(parseUtcDate(alert.created_at))}
                    </span>
                    <button
                      onClick={() => handleEditStart(alert)}
                      disabled={isAcknowledging}
                      className="px-2 py-1 text-xs font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                      title="Edit reason"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onUnacknowledge(alert.id)}
                      disabled={isUnacknowledging}
                      className="px-2 py-1 text-xs font-medium rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                      title="Reopen this alert"
                    >
                      Unack
                    </button>
                  </div>
                </div>
                {editingAlertId === alert.id ? (
                  <div className="flex items-center gap-2 mt-2 ml-1">
                    <AckSuggestions
                      port={alert.port}
                      value={editReason}
                      onChange={setEditReason}
                      onEnter={() => handleEditSubmit(alert.id)}
                      onEscape={handleEditCancel}
                      placeholder="Reason (optional)"
                      autoFocus
                      className="flex-1 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleEditSubmit(alert.id)}
                      disabled={isAcknowledging}
                      className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="px-2 py-1 text-xs font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : alert.ack_reason ? (
                  <p className="mt-1 ml-1 text-xs text-slate-500 dark:text-slate-400 italic">
                    Reason: {alert.ack_reason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
