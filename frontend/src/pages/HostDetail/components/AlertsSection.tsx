import { useState } from 'react'
import AckModal from '../../../components/AckModal'
import AckSuggestions from '../../../components/AckSuggestions'
import {
  parseUtcDate,
  severityColors,
  alertTypeLabels,
  PORT_ALERT_TYPES,
} from '../../../lib/formatters'
import type { HostAlertSummary } from '../../../types'

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

type Props = {
  alerts: HostAlertSummary[]
  acknowledgedAlerts: HostAlertSummary[]
  acknowledgedCount: number
  hostIp: string
  isAdmin: boolean
  onAcknowledge: (alertId: number, reason?: string, includeSSH?: boolean) => void
  onUnacknowledge: (alertId: number) => void
  onCreateRule?: (payload: {
    network_id?: number | null
    ip?: string | null
    port: string
    rule_type: 'accepted' | 'critical'
    description?: string | null
  }) => void
  isAcknowledging: boolean
  isUnacknowledging: boolean
}

export default function AlertsSection({
  alerts,
  acknowledgedAlerts,
  acknowledgedCount,
  hostIp,
  isAdmin,
  onAcknowledge,
  onUnacknowledge,
  onCreateRule,
  isAcknowledging,
  isUnacknowledging,
}: Props) {
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [ackAlert, setAckAlert] = useState<HostAlertSummary | null>(null)
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null)
  const [editReason, setEditReason] = useState('')
  const activeAlerts = alerts.filter((a) => !a.acknowledged)

  const handleAckModalClose = () => setAckAlert(null)

  const handleAcknowledgeOnly = (reason: string, includeSSH: boolean) => {
    if (!ackAlert) return
    onAcknowledge(ackAlert.id, reason || undefined, includeSSH)
    setAckAlert(null)
  }

  const handleAcceptGlobal = (reason: string, includeSSH: boolean) => {
    if (!ackAlert || !onCreateRule) return
    onCreateRule({
      network_id: null,
      ip: null,
      port: String(ackAlert.port),
      rule_type: 'accepted',
      description: reason || null,
    })
    if (includeSSH) {
      onAcknowledge(ackAlert.id, reason || undefined, true)
    }
    setAckAlert(null)
  }

  const handleAcceptNetwork = (reason: string, includeSSH: boolean) => {
    if (!ackAlert || !onCreateRule) return
    onCreateRule({
      network_id: ackAlert.network_id,
      ip: null,
      port: String(ackAlert.port),
      rule_type: 'accepted',
      description: reason || null,
    })
    if (includeSSH) {
      onAcknowledge(ackAlert.id, reason || undefined, true)
    }
    setAckAlert(null)
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
            {showAcknowledged ? 'Hide' : 'Show'} dismissed ({acknowledgedCount})
          </button>
        )}
      </div>

      {activeAlerts.length === 0 && acknowledgedCount === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">No alerts for this host.</p>
      )}

      {activeAlerts.length === 0 && acknowledgedCount > 0 && !showAcknowledged && (
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
                      alert.related_ssh_alerts_acknowledged
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                    }`}
                    title={
                      alert.related_ssh_alerts_acknowledged
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
                    onClick={() => setAckAlert(alert)}
                    disabled={isAcknowledging}
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

      {showAcknowledged && acknowledgedAlerts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Dismissed</h4>
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
                          Reopen
                        </button>
                      </>
                    )}
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

      {/* AckModal for 3-option acknowledge flow */}
      {ackAlert && (
        <AckModal
          alerts={[
            {
              id: ackAlert.id,
              ip: hostIp,
              port: ackAlert.port,
              network_id: ackAlert.network_id,
              network_name: ackAlert.network_name,
              related_ssh_alert_count: ackAlert.related_ssh_alert_count,
              related_ssh_alerts_acknowledged: ackAlert.related_ssh_alerts_acknowledged,
            },
          ]}
          mode="single"
          onAcknowledgeOnly={handleAcknowledgeOnly}
          onAcceptGlobal={handleAcceptGlobal}
          onAcceptNetwork={handleAcceptNetwork}
          onClose={handleAckModalClose}
          isProcessing={isAcknowledging}
        />
      )}
    </div>
  )
}
