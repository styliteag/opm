import { useState } from 'react'
import ReviewModal from '../../../components/ReviewModal'
import ReasonSuggestions from '../../../components/ReasonSuggestions'
import {
  parseUtcDate,
  formatRelativeTime,
  severityColors,
  alertTypeLabels,
  PORT_ALERT_TYPES,
} from '../../../lib/formatters'
import type { HostAlertSummary } from '../../../types'

type Props = {
  alerts: HostAlertSummary[]
  dismissedAlerts: HostAlertSummary[]
  dismissedCount: number
  hostIp: string
  isAdmin: boolean
  onDismiss: (alertId: number, reason?: string, includeSSH?: boolean) => void
  onReopen: (alertId: number) => void
  onCreateRule?: (payload: {
    network_id?: number | null
    ip?: string | null
    port: string
    rule_type: 'accepted' | 'critical'
    description?: string | null
  }) => void
  isDismissing: boolean
  isReopening: boolean
}

export default function AlertsSection({
  alerts,
  dismissedAlerts,
  dismissedCount,
  hostIp,
  isAdmin,
  onDismiss,
  onReopen,
  onCreateRule,
  isDismissing,
  isReopening,
}: Props) {
  const [showDismissed, setShowDismissed] = useState(false)
  const [reviewAlert, setReviewAlert] = useState<HostAlertSummary | null>(null)
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null)
  const [editReason, setEditReason] = useState('')
  const activeAlerts = alerts.filter((a) => !a.dismissed)

  const handleReviewClose = () => setReviewAlert(null)

  const handleDismiss = (reason: string, includeSSH: boolean) => {
    if (!reviewAlert) return
    onDismiss(reviewAlert.id, reason || undefined, includeSSH)
    setReviewAlert(null)
  }

  const handleAcceptGlobal = (reason: string, includeSSH: boolean) => {
    if (!reviewAlert || !onCreateRule) return
    onCreateRule({
      network_id: null,
      ip: null,
      port: String(reviewAlert.port),
      rule_type: 'accepted',
      description: reason || null,
    })
    if (includeSSH) {
      onDismiss(reviewAlert.id, reason || undefined, true)
    }
    setReviewAlert(null)
  }

  const handleAcceptNetwork = (reason: string, includeSSH: boolean) => {
    if (!reviewAlert || !onCreateRule) return
    onCreateRule({
      network_id: reviewAlert.network_id,
      ip: null,
      port: String(reviewAlert.port),
      rule_type: 'accepted',
      description: reason || null,
    })
    if (includeSSH) {
      onDismiss(reviewAlert.id, reason || undefined, true)
    }
    setReviewAlert(null)
  }

  const handleEditStart = (alert: HostAlertSummary) => {
    setEditingAlertId(alert.id)
    setEditReason(alert.dismiss_reason ?? '')
  }

  const handleEditSubmit = (alertId: number) => {
    onDismiss(alertId, editReason.trim() || undefined)
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
        {dismissedCount > 0 && (
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {showDismissed ? 'Hide' : 'Show'} dismissed ({dismissedCount})
          </button>
        )}
      </div>

      {activeAlerts.length === 0 && dismissedCount === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">No alerts for this host.</p>
      )}

      {activeAlerts.length === 0 && dismissedCount > 0 && !showDismissed && (
        <p className="text-green-600 dark:text-green-400 text-sm">All alerts dismissed.</p>
      )}

      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
            >
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
                      alert.related_ssh_alerts_dismissed
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                    }`}
                    title={
                      alert.related_ssh_alerts_dismissed
                        ? `${alert.related_ssh_alert_count} SSH finding(s) dismissed`
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
                {isAdmin && (
                  <button
                    onClick={() => setReviewAlert(alert)}
                    disabled={isDismissing}
                    className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    title="Review"
                  >
                    Review
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showDismissed && dismissedAlerts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Dismissed</h4>
          <div className="space-y-2">
            {dismissedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityColors.info}`}
                    >
                      dismissed
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
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleEditStart(alert)}
                          disabled={isDismissing}
                          className="px-2 py-1 text-xs font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                          title="Edit reason"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onReopen(alert.id)}
                          disabled={isReopening}
                          className="px-2 py-1 text-xs font-medium rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                          title="Reopen this alert"
                        >
                          Reopen
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingAlertId === alert.id ? (
                  <div className="flex items-center gap-2 mt-2 ml-1">
                    <ReasonSuggestions
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
                      disabled={isDismissing}
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
                ) : alert.dismiss_reason ? (
                  <p className="mt-1 ml-1 text-xs text-slate-500 dark:text-slate-400 italic">
                    Reason: {alert.dismiss_reason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ReviewModal for 3-option acknowledge flow */}
      {reviewAlert && (
        <ReviewModal
          alerts={[
            {
              id: reviewAlert.id,
              ip: hostIp,
              port: reviewAlert.port,
              network_id: reviewAlert.network_id,
              network_name: reviewAlert.network_name,
              related_ssh_alert_count: reviewAlert.related_ssh_alert_count,
              related_ssh_alerts_dismissed: reviewAlert.related_ssh_alerts_dismissed,
            },
          ]}
          mode="single"
          onDismiss={handleDismiss}
          onAcceptGlobal={handleAcceptGlobal}
          onAcceptNetwork={handleAcceptNetwork}
          onClose={handleReviewClose}
          isProcessing={isDismissing}
        />
      )}
    </div>
  )
}
