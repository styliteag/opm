import { useState } from 'react'
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

type Props = {
  alerts: HostAlertSummary[]
  acknowledgedCount: number
  onAcknowledge: (alertId: number) => void
  isAcknowledging: boolean
}

export default function AlertsSection({ alerts, acknowledgedCount, onAcknowledge, isAcknowledging }: Props) {
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const activeAlerts = alerts.filter((a) => !a.acknowledged)
  const ackedAlerts = alerts.filter((a) => a.acknowledged)

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
            <div
              key={alert.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityColors[alert.severity] ?? severityColors.medium}`}>
                  {alert.severity}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {alertTypeLabels[alert.type] ?? alert.type}
                </span>
                <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                  :{alert.port}
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                  {alert.message}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-xs text-slate-400" title={parseUtcDate(alert.created_at).toLocaleString()}>
                  {formatRelativeTime(parseUtcDate(alert.created_at))}
                </span>
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  disabled={isAcknowledging}
                  className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  title="Acknowledge"
                >
                  Ack
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAcknowledged && ackedAlerts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Acknowledged</h4>
          <div className="space-y-2">
            {ackedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/30 opacity-60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                    {alertTypeLabels[alert.type] ?? alert.type}
                  </span>
                  <span className="text-sm font-mono text-slate-400">:{alert.port}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{alert.message}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {formatRelativeTime(parseUtcDate(alert.created_at))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
